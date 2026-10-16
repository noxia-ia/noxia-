// Test SQL RÉEL des crédits, de la finalisation et du stockage : exécute les VRAIES migrations 0001 → 0012 sur un vrai PostgreSQL (PGlite, WASM, en mémoire).
// Ce n'est PAS un Supabase : le schéma « auth », les rôles et le schéma « storage » sont recréés minimalement ci-dessous (reproduction de ce que Supabase fournit).
// Limite : PGlite n'a qu'UNE connexion, donc les appels « simultanés » sont sérialisés : le verrou de ligne (select … for update) n'est pas éprouvé par une vraie concurrence.
// Lancer : npm run test:db
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
ok(`1. migrations ${files[0].slice(0, 4)} → ${files.at(-1).slice(0, 4)} (${files.length} fichiers) exécutées SANS erreur sur un vrai PostgreSQL`);

const as = async (role, sub, fn) => { await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]); try { return await fn(); } finally { await db.exec("reset role"); } };
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert.match(String(e.message), re, e.message); return; } assert.fail(`aucune erreur (attendu : ${re})`); };
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const mkUser = async email => (await one("insert into auth.users(email) values ($1) returning id", [email])).id;
const mkGen = async (uid, extra = "") => (await one(`insert into public.generations(user_id, module, prompt, params ${extra ? "," + extra.split("=")[0] : ""}) values ($1, 'image', 'A cinematic landscape of a tropical city at sunset', '{"count":2}'::jsonb ${extra ? "," + extra.split("=")[1] : ""}) returning id`, [uid])).id;
const credits = async uid => (await one("select credits from public.profiles where user_id=$1", [uid])).credits;
const gen = id => one("select status, credits_used, provider, error_code, result from public.generations where id=$1", [id]);
const RESULT = JSON.stringify({ images: [{ url: "https://proj.supabase.co/x/a.png", storedUrl: "https://proj.supabase.co/x/a.png", mimeType: "image/png", width: 64, height: 48 }] });
const finalize = (id, status, cost, extra = "") => as("service_role", null, () => db.query(`select public.finalize_generation(p_generation_id => $1::uuid, p_status => $2, p_result => ${status === "completed" ? "$3::jsonb" : "null"}, p_credits => ${status === "completed" ? "$4::int" : "0"}, p_provider => 'huggingface', p_error => ${status === "failed" ? "'Ta génération a échoué.'" : "null"}, p_error_code => ${status === "failed" ? "'RESULT_INVALID'" : "null"} ${extra})`, status === "completed" ? [id, status, RESULT, cost] : [id, status]));

// 2) le module « image » est accepté et le solde de départ est bien 0 (créé par le trigger), puis crédité par le serveur
const alice = await mkUser("alice@example.test"), bob = await mkUser("bob@example.test");
assert.equal(await credits(alice), 5); await as("service_role", null, () => db.query("update public.profiles set credits = 5 where user_id = $1", [alice]));
const g1 = await mkGen(alice); assert.equal((await gen(g1)).status, "pending");
ok("2. profil créé par le trigger avec 5 crédits de découverte (0015) ; module « image » accepté par la table generations ; solde de test = 5");

// 3) réussite : débit exact, une seule fois
await finalize(g1, "completed", 2);
let g = await gen(g1); assert.deepEqual([g.status, g.credits_used, g.provider, g.error_code], ["completed", 2, "huggingface", null]); assert.equal(g.result.images[0].storedUrl, "https://proj.supabase.co/x/a.png"); assert.equal(await credits(alice), 3);
ok("3. finalisation réussie : 5 → 3 crédits (coût 2), statut « completed », fournisseur et résultat enregistrés");

// 4) double finalisation : refusée, aucun second débit (ni en réussite, ni en échec)
await fails(() => finalize(g1, "completed", 2), /already_finalized/); await fails(() => finalize(g1, "failed", 0), /already_finalized/);
assert.equal(await credits(alice), 3); g = await gen(g1); assert.deepEqual([g.status, g.credits_used], ["completed", 2]);
ok("4. double finalisation (réussite OU échec) → « already_finalized », solde inchangé (3), résultat inchangé");
const g2 = await mkGen(alice); const res = await Promise.allSettled([finalize(g2, "completed", 1), finalize(g2, "completed", 1), finalize(g2, "completed", 1)]);
assert.equal(res.filter(r => r.status === "fulfilled").length, 1); assert.equal(await credits(alice), 2);
ok("5. trois finalisations lancées ensemble sur la même génération : UNE seule réussit, un seul débit (3 → 2) — sérialisées par PGlite, voir la limite en en-tête");

// 6) crédits insuffisants : rien n'est débité, la génération reste ouverte, puis échec propre
const g3 = await mkGen(alice); await fails(() => finalize(g3, "completed", 4), /insufficient_credits/);
assert.equal(await credits(alice), 2); assert.equal((await gen(g3)).status, "pending");
await finalize(g3, "failed", 0); g = await gen(g3); assert.deepEqual([g.status, g.credits_used, g.error_code], ["failed", 0, "RESULT_INVALID"]); assert.equal(await credits(alice), 2);
await fails(() => finalize(g3, "completed", 1), /already_finalized/); assert.equal(await credits(alice), 2);
ok("6. crédits insuffisants → « insufficient_credits », solde intact, génération toujours ouverte ; échec enregistré sans débit ; réussite tardive après échec refusée");

// 7) cohérence fournisseur et solde jamais négatif
const g4 = await mkGen(alice, "provider='openrouter'"); await fails(() => finalize(g4, "completed", 1), /provider_mismatch/); assert.equal(await credits(alice), 2);
await fails(() => as("service_role", null, () => db.query("update public.profiles set credits = -1 where user_id=$1", [alice])), /check/i);
ok("7. fournisseur différent de celui enregistré → « provider_mismatch », aucun débit ; un solde négatif est impossible (contrainte CHECK)");

// 8) droits : un utilisateur connecté ne peut ni finaliser, ni créer une génération, ni toucher à ses crédits, ni lire celui des autres
const gBob = await mkGen(bob);
await fails(() => as("authenticated", alice, () => db.query("select public.finalize_generation($1::uuid, 'completed', $2::jsonb, 1)", [g4, RESULT])), /permission denied/);
await fails(() => as("authenticated", alice, () => db.query("insert into public.generations(user_id, module, prompt) values ($1, 'image', 'x')", [alice])), /permission denied/);
await fails(() => as("authenticated", alice, () => db.query("update public.profiles set credits = 999 where user_id=$1", [alice])), /permission denied/);
await fails(() => as("authenticated", alice, () => db.query("update public.generations set status='completed', credits_used=0 where id=$1", [g4])), /permission denied/);
await as("authenticated", alice, () => db.query("update public.profiles set full_name='Alice' where user_id=$1", [alice]));
const seen = await as("authenticated", alice, () => db.query("select id from public.generations")); assert.ok(seen.rows.length >= 4 && !seen.rows.some(r => r.id === gBob), "RLS : aucune génération d'un autre utilisateur");
for (const t of ["stored_assets", "provider_health_checks"]) await fails(() => as("authenticated", alice, () => db.query(`select * from public.${t}`)), /permission denied/);
await fails(() => as("anon", null, () => db.query("select * from public.profiles")), /permission denied/);
assert.equal(await credits(alice), 2);
ok("8. droits : l'utilisateur ne peut ni finaliser, ni insérer, ni modifier crédits/statut ; il voit ses générations et JAMAIS celles d'un autre (RLS) ; stored_assets et santé fermés ; anonyme refusé");

// 9) nettoyage des fichiers : échec / expiré / orphelin purgés, réussite et récent conservés
const asset = (uid, gid, p, ago, exp = null) => db.query("insert into public.stored_assets(user_id, generation_id, storage_provider, path, mime_type, bytes, created_at, expires_at) values ($1,$2,'supabase-storage',$3,'image/png',500, now() - $4::interval, $5)", [uid, gid, p, ago, exp]);
const gFailedOld = await mkGen(alice, "status='failed'"), gFailedNew = await mkGen(alice, "status='failed'"), gDone = g1;
await asset(alice, gFailedOld, "p/failed-old.png", "2 hours"); await asset(alice, gFailedNew, "p/failed-new.png", "10 minutes"); await asset(alice, gDone, "p/completed.png", "2 hours"); await asset(alice, gDone, "p/expired.png", "2 hours", new Date(Date.now() - 1000).toISOString()); await asset(alice, null, "p/orphan.png", "2 hours");
const purge = (await as("service_role", null, () => db.query("select path from public.purgeable_assets(100)"))).rows.map(r => r.path).sort();
assert.deepEqual(purge, ["p/expired.png", "p/failed-old.png", "p/orphan.png"]);
await fails(() => as("authenticated", alice, () => db.query("select * from public.purgeable_assets(10)")), /permission denied/);
ok("9. purge : fichiers d'une génération ÉCHOUÉE depuis > 1 h, expirés ou orphelins → à supprimer ; génération réussie et échec récent (< 1 h) → conservés ; fonction fermée aux utilisateurs");

// 10) générations bloquées : expirées sans débit, finalisation tardive refusée
const gStale = await mkGen(alice, "created_at=now() - interval '30 minutes'"); const before = await credits(alice);
const exp = await as("service_role", null, () => db.query("select * from public.expire_stale_generations(15, 60)")); assert.ok(Number(exp.rows[0].generations_expired) >= 1);
g = await gen(gStale); assert.deepEqual([g.status, g.credits_used, g.error_code], ["failed", 0, "PROVIDER_TIMEOUT"]); await fails(() => finalize(gStale, "completed", 1), /already_finalized/); assert.equal(await credits(alice), before);
ok("10. génération « pending » > 15 min → échouée par la maintenance sans débit ; un résultat arrivant après coup est refusé (aucun débit)");

// 11) bucket de stockage : public en lecture, 15 Mo, trois types d'image, AUCUNE politique d'écriture ; migration rejouable
const b = await one("select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='dracula-images'");
assert.deepEqual([b.public, Number(b.file_size_limit), [...b.allowed_mime_types].sort()], [true, 15 * 1024 * 1024, ["image/jpeg", "image/png", "image/webp"]]);
assert.equal(Number((await one("select count(*) from pg_policies where schemaname='storage' and tablename='objects'")).count), 0, "aucune politique : le navigateur ne peut pas écrire");
await fails(() => as("authenticated", alice, () => db.query("insert into storage.objects(bucket_id, name) values ('dracula-images', 'x.png')")), /permission denied|row-level security/i);
await db.exec(fs.readFileSync(path.join(MIG, "0012_image_storage_bucket.sql"), "utf8")); assert.equal(Number((await one("select count(*) from storage.buckets where id='dracula-images'")).count), 1);
ok("11. bucket « dracula-images » : public, 15 Mo, png/jpeg/webp ; aucune politique sur storage.objects (écriture client refusée dans le modèle Supabase reproduit) ; migration 0012 rejouable");

console.log(`\n${n} groupes de tests SQL réussis`);
await db.close();
