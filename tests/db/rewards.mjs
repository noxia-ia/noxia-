// Test SQL RÉEL du flux de récompense : exécute TOUTES les migrations sur un vrai PostgreSQL (PGlite, en mémoire).
// Couvre : session de visionnage serveur, +N crédits exactement une fois, plafond, droits, administration, trigger d'inscription.
// Limite : PGlite n'a qu'UNE connexion → les appels « simultanés » sont sérialisés (le verrou FOR UPDATE n'est pas éprouvé en vraie concurrence).
// Lancer : npm run test:rewards
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIG = path.resolve(import.meta.dirname, "../../supabase/migrations");
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create schema storage; grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text); alter table storage.objects enable row level security;
  create publication supabase_realtime; -- fourni par Supabase ; requis par la migration realtime
`);
const files = fs.readdirSync(MIG).filter(f => f.endsWith(".sql")).sort();
for (const f of files) await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
let n = 0; const ok = m => { n++; process.stdout.write(`  ✔ ${m}\n`); };
ok(`1. ${files.length} migrations (${files[0].slice(0, 4)} → ${files.at(-1).slice(0, 8)}) exécutées SANS erreur`);

const as = async (role, sub, fn) => { await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]); try { return await fn(); } finally { await db.exec("reset role"); } };
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert.match(String(e.message), re, e.message); return; } assert.fail(`aucune erreur (attendu : ${re})`); };
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const mkUser = async (email, meta = {}) => (await one("insert into auth.users(email, raw_user_meta_data) values ($1, $2::jsonb) returning id", [email, JSON.stringify(meta)])).id;
const credits = async uid => (await one("select credits from public.profiles where user_id=$1", [uid])).credits;
const svc = (sql, p = []) => as("service_role", null, () => db.query(sql, p));
const rpc = (fn, ...args) => svc(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args).then(r => r.rows[0].r);
const mkCampaign = async (extra = {}) => {
  const c = { slug: `c-${Math.random().toString(36).slice(2, 8)}`, reward: 2, duration: 30, max: null, status: "active", platform: "other", ...extra };
  return (await one(
    `insert into public.reward_campaigns(slug,title,platform,video_url,destination_url,duration_seconds,reward_credits,required_action,max_rewards,status,active)
     values ($1,'Test',$2,'https://example.test/v','https://example.test/a',$3,$4,'subscribe',$5,$6,$7) returning id`,
    [c.slug, c.platform, c.duration, c.reward, c.max, c.status, c.status === "active"])).id;
};
const backdate = (cid, uid, secs) => svc("update public.reward_claims set watch_started_at = now() - ($3 || ' seconds')::interval where campaign_id=$1 and user_id=$2", [cid, uid, String(secs)]);
const fullFlow = async (cid, uid) => { await rpc("start_reward_watch", cid, uid); await backdate(cid, uid, 31); await rpc("heartbeat_reward_watch", cid, uid); await rpc("complete_reward_watch", cid, uid); await rpc("record_reward_action_proof", cid, uid, "internal", "test-user"); return rpc("finalize_reward_claim", cid, uid, "internal", "test-user"); };

// 2) inscription : 5 crédits de découverte, date de naissance conservée, moins de 15 ans refusé (régression 0015 corrigée par 0017)
const alice = await mkUser("alice@example.test", { date_of_birth: "1995-05-05" });
const p = await one("select credits, date_of_birth, age_verified_at from public.profiles where user_id=$1", [alice]);
assert.equal(p.credits, 5); assert.ok(p.date_of_birth && p.age_verified_at);
const yr = new Date().getFullYear() - 10;
await fails(() => mkUser("kid@example.test", { date_of_birth: `${yr}-01-01` }), /age_restricted/);
const noDob = await mkUser("nodob@example.test"); assert.equal((await one("select date_of_birth from public.profiles where user_id=$1", [noDob])).date_of_birth, null);
ok("2. inscription : 5 crédits + date de naissance conservée ; moins de 15 ans refusé par la base ; sans date → profil sans date (bloqué jusqu'à /verify-age)");

// 3) flux complet : +2 exactement, une seule fois
const camp = await mkCampaign();
const before = await credits(alice);
const started = await rpc("start_reward_watch", camp, alice); assert.ok(started);
await fails(() => rpc("complete_reward_watch", camp, alice), /watch_incomplete/);
await fails(() => rpc("record_reward_action_proof", camp, alice, "internal", "t"), /reward_conditions_not_met/);
await fails(() => rpc("finalize_reward_claim", camp, alice, "internal", "t"), /reward_conditions_not_met/);
assert.equal(await credits(alice), before);
ok("3a. visionnage < 30 s : complete refusé (watch_incomplete), preuve d'action refusée, finalisation refusée, solde inchangé");
const again = await rpc("start_reward_watch", camp, alice); assert.equal(new Date(again).getTime(), new Date(started).getTime());
ok("3b. relancer la session ne remet PAS le compteur à zéro (heure de départ serveur conservée)");
await backdate(camp, alice, 31); await fails(() => rpc("complete_reward_watch", camp, alice), /watch_presence_missing/); await rpc("heartbeat_reward_watch", camp, alice); assert.equal(await rpc("complete_reward_watch", camp, alice), true);
await fails(() => rpc("finalize_reward_claim", camp, alice, "internal", "t"), /reward_conditions_not_met/); // action pas encore prouvée
assert.equal(await credits(alice), before);
await rpc("record_reward_action_proof", camp, alice, "internal", "t");
assert.equal(await rpc("finalize_reward_claim", camp, alice, "internal", "t"), 2);
assert.equal(await credits(alice), before + 2);
ok("3c. visionnage validé + action prouvée → exactement +2 crédits");
assert.equal(await rpc("finalize_reward_claim", camp, alice, "internal", "t"), 0); assert.equal(await credits(alice), before + 2);
const dup = await Promise.all([rpc("finalize_reward_claim", camp, alice, "internal", "t"), rpc("finalize_reward_claim", camp, alice, "internal", "t")]); assert.deepEqual(dup, [0, 0]);
assert.equal(await credits(alice), before + 2); assert.equal(Number((await one("select count(*) from public.reward_events where user_id=$1 and kind='rewarded_campaign'", [alice])).count), 1);
ok("3d. réclamation en double (séquentielle et simultanée) → +0, solde inchangé, un seul reward_event");

// 4) récompense maximale (50) : la contrainte reward_events héritée de 0015 (≤ 10) bloquait ce cas
const big = await mkCampaign({ reward: 50 }); const bob = await mkUser("bob@example.test", { date_of_birth: "1990-01-01" });
const b0 = await credits(bob); assert.equal(await fullFlow(big, bob), 50); assert.equal(await credits(bob), b0 + 50);
ok("4. campagne à 50 crédits : créditée correctement (contrainte reward_events corrigée)");

// 5) campagne inactive / hors fenêtre / en pause
const paused = await mkCampaign({ status: "paused" }); const carol = await mkUser("carol@example.test", { date_of_birth: "1990-01-01" });
await fails(() => rpc("start_reward_watch", paused, carol), /campaign_inactive/);
const live = await mkCampaign(); await rpc("start_reward_watch", live, carol); await backdate(live, carol, 31); await rpc("heartbeat_reward_watch", live, carol); await rpc("complete_reward_watch", live, carol); await rpc("record_reward_action_proof", live, carol, "internal", "t");
await svc("update public.reward_campaigns set status='paused', active=false where id=$1", [live]);
await fails(() => rpc("finalize_reward_claim", live, carol, "internal", "t"), /campaign_inactive/);
const future = await mkCampaign(); await svc("update public.reward_campaigns set starts_at = now() + interval '1 day' where id=$1", [future]);
await fails(() => rpc("start_reward_watch", future, carol), /campaign_inactive/);
await fails(() => svc("update public.reward_campaigns set status='paused' where id=$1", [future]), /active_matches_status/);
assert.equal(await credits(carol), 5);
ok("4b. campagne en pause / pas commencée → refus, 0 crédit ; « active » ne peut jamais diverger de « status »");

// 6) plafond max_rewards
const capped = await mkCampaign({ max: 1 }); const dave = await mkUser("dave@example.test", { date_of_birth: "1990-01-01" }); const erin = await mkUser("erin@example.test", { date_of_birth: "1990-01-01" });
assert.equal(await fullFlow(capped, dave), 2);
await rpc("start_reward_watch", capped, erin); await backdate(capped, erin, 31); await rpc("heartbeat_reward_watch", capped, erin); await rpc("complete_reward_watch", capped, erin); await rpc("record_reward_action_proof", capped, erin, "internal", "t");
await fails(() => rpc("finalize_reward_claim", capped, erin, "internal", "t"), /campaign_exhausted/); assert.equal(await credits(erin), 5);
assert.equal(await rpc("finalize_reward_claim", capped, dave, "internal", "t"), 0);
ok("5. plafond max_rewards=1 : 2e utilisateur refusé (campaign_exhausted, 0 crédit) ; le 1er réclamant répété reçoit +0 sans erreur");

// 7) droits : un utilisateur connecté ne peut appeler AUCUNE fonction de récompense ni écrire dans les tables
for (const fn of ["start_reward_watch", "complete_reward_watch"]) await fails(() => as("authenticated", erin, () => db.query(`select public.${fn}($1::uuid,$2::uuid)`, [camp, erin])), /permission denied/);
await fails(() => as("authenticated", erin, () => db.query("select public.record_reward_action_proof($1::uuid,$2::uuid,'x','y')", [camp, erin])), /permission denied/);
await fails(() => as("authenticated", erin, () => db.query("select public.finalize_reward_claim($1::uuid,$2::uuid,'x','y')", [camp, erin])), /permission denied/);
await fails(() => as("authenticated", erin, () => db.query("insert into public.reward_claims(campaign_id,user_id,watch_verified,action_verified) values ($1,$2,true,true)", [live, erin])), /permission denied/);
await fails(() => as("authenticated", erin, () => db.query("update public.profiles set credits = credits + 100 where user_id=$1", [erin])), /permission denied/);
await fails(() => as("anon", null, () => db.query("select * from public.reward_campaigns")), /permission denied/);
const own = await as("authenticated", dave, () => db.query("select user_id from public.reward_claims")); assert.ok(own.rows.length >= 1 && own.rows.every(r => r.user_id === dave));
ok("6. droits : fonctions réservées au serveur, aucune écriture client sur claims/crédits, anonyme refusé, chacun ne voit que ses propres réclamations (RLS)");

// 2) administration : réservée aux admins, audit, jamais d'activation implicite, brouillons invisibles pour les non-admins
const admin = await mkUser("admin@example.test", { date_of_birth: "1980-01-01" }); await svc("update public.profiles set role='admin' where user_id=$1", [admin]);
const cid = (await one("select gen_random_uuid() as id")).id;
const save = (uid, id, over = {}) => as("authenticated", uid, () => db.query(
  "select public.admin_save_campaign($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,null) as r",
  [id, over.slug ?? "nouvelle", over.title ?? "Nouvelle", "other", over.video ?? "https://example.test/v", "https://example.test/a", over.duration ?? 30, over.reward ?? 2, "subscribe", over.max ?? null]));
await fails(() => save(erin, cid), /not_authorized/);
await save(admin, cid);
let row = await one("select status, active from public.reward_campaigns where id=$1", [cid]); assert.deepEqual([row.status, row.active], ["draft", false]);
await fails(() => save(admin, cid, { video: "http://insecure.test/v" }), /invalid_url/);
await fails(() => save(admin, cid, { reward: 51 }), /check/i); await fails(() => save(admin, cid, { duration: 2 }), /check/i);
await save(admin, cid, { reward: 12, max: 100 });
assert.equal((await as("authenticated", erin, () => db.query("select id from public.reward_campaigns where id=$1", [cid]))).rows.length, 0);
assert.equal((await as("authenticated", admin, () => db.query("select id from public.reward_campaigns where id=$1", [cid]))).rows.length, 1);
await fails(() => as("authenticated", erin, () => db.query("select public.admin_set_campaign_status($1::uuid,'active')", [cid])), /not_authorized/);
await as("authenticated", admin, () => db.query("select public.admin_set_campaign_status($1::uuid,'active')", [cid]));
row = await one("select status, active from public.reward_campaigns where id=$1", [cid]); assert.deepEqual([row.status, row.active], ["active", true]);
assert.equal((await as("authenticated", erin, () => db.query("select id from public.reward_campaigns where id=$1", [cid]))).rows.length, 1);
const audit = (await db.query("select action from public.reward_campaign_audit where campaign_id=$1 order by created_at", [cid])).rows.map(r => r.action); assert.deepEqual(audit, ["create", "update", "status"]);
assert.equal((await as("authenticated", erin, () => db.query("select * from public.reward_campaign_audit"))).rows.length, 0);
assert.ok((await as("authenticated", admin, () => db.query("select * from public.reward_campaign_audit"))).rows.length >= 3);
ok("7. admin : refusé aux non-admins ; création en brouillon ; URL http / crédits > 50 / durée < 5 refusés ; activation séparée ; brouillon invisible aux utilisateurs ; audit create → update → status");

console.log(`\n${n} groupes de tests réussis`);
await db.close();
