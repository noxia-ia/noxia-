// Test SQL RÉEL de la migration 0051 sur un vrai PostgreSQL (PGlite). Schéma Supabase minimal recréé (auth.users). Lancer : npm run test:chat-windows
// Limite : PGlite n'a qu'UNE connexion : les appels « simultanés » sont sérialisés ; le verrou consultatif n'est donc pas éprouvé en vrai parallélisme (à valider sur Supabase).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create role anon; create role authenticated; create role service_role;`);
await db.exec(fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/0051_chat_windows.sql"), "utf8"));
const user = async () => (await db.query("insert into auth.users default values returning id")).rows[0].id;
const enter = async (u, plan, cost) => (await db.query("select * from public.chat_window_enter($1,$2,$3)", [u, plan, cost])).rows[0];
let n = 0; const ok = t => { n++; console.log(`  ✔ ${t}`); };

// 1) durées par plan
const rules = Object.fromEntries((await db.query("select plan, duration_minutes, max_credits from public.chat_window_rules")).rows.map(r => [r.plan, r]));
assert.deepEqual(Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, v.duration_minutes])), { free: 210, plus: 360, pro: 540, ultra: 720 });
assert.ok(Object.values(rules).every(r => r.max_credits === null), "aucun plafond imposé à la livraison");
ok("1. durées : Free 3 h 30 (210 min), Plus 6 h, Pro 9 h, Ultra 12 h ; aucun plafond de crédits imposé");

for (const [plan, minutes] of [["free", 210], ["plus", 360], ["pro", 540], ["ultra", 720]]) {
  const u = await user(); const w = await enter(u, plan, 1);
  assert.equal(w.allowed, true); assert.equal(Math.round((new Date(w.ends_at) - new Date(w.started_at)) / 60000), minutes, plan);
}
ok("2. la fenêtre ouverte au 1er message a exactement la durée du plan");

// 3) réutilisation + comptage ; une seule fenêtre ouverte
const u1 = await user(); const a = await enter(u1, "free", 1), b = await enter(u1, "free", 2);
assert.equal(a.window_id, b.window_id); assert.equal(b.credits_used, 3);
assert.equal((await db.query("select count(*)::int c from public.chat_windows where user_id=$1", [u1])).rows[0].c, 1);
const par = await Promise.all(Array.from({ length: 10 }, () => enter(u1, "free", 1)));
assert.equal((await db.query("select count(*)::int c from public.chat_windows where user_id=$1", [u1])).rows[0].c, 1, "jamais deux fenêtres");
assert.equal((await db.query("select credits_used, messages_count from public.chat_windows where user_id=$1", [u1])).rows[0].credits_used, 13);
ok("3. messages successifs ET lancés « ensemble » : une seule fenêtre, comptage exact");

// 4) glissement : expiration → nouvelle fenêtre au message suivant
await db.query("update public.chat_windows set started_at = now() - interval '4 hours', ends_at = now() - interval '30 minutes' where user_id=$1", [u1]);
const c = await enter(u1, "free", 1);
assert.notEqual(c.window_id, a.window_id); assert.ok(new Date(c.started_at) > new Date(Date.now() - 60000), "la nouvelle fenêtre démarre au message, pas sur le calendrier"); assert.equal(c.credits_used, 1);
assert.equal((await db.query("select count(*)::int c from public.chat_windows where user_id=$1", [u1])).rows[0].c, 2);
ok("4. fenêtre expirée : la suivante s'ouvre au premier message suivant (fenêtre glissante) ; l'ancienne est conservée");

// 5) plafond (quand le propriétaire en fixe un) : jamais dépassé, même par des appels simultanés
await db.query("update public.chat_window_rules set max_credits = 5 where plan = 'plus'");
const u2 = await user(); const outs = await Promise.all(Array.from({ length: 9 }, () => enter(u2, "plus", 1)));
assert.equal(outs.filter(o => o.allowed).length, 5); assert.equal(outs.filter(o => !o.allowed && o.reason === "window_cap").length, 4);
assert.equal((await db.query("select credits_used from public.chat_windows where user_id=$1", [u2])).rows[0].credits_used, 5);
const big = await enter(await user(), "plus", 6); assert.equal(big.allowed, false);
ok("5. plafond = 5 : 9 demandes → exactement 5 acceptées, 4 refusées (window_cap), jamais de dépassement ; une demande de 6 refusée d'emblée");

// 6) libération (échec de livraison) synchronisée
const u3 = await user(); const w3 = await enter(u3, "plus", 2);
assert.equal((await db.query("select public.chat_window_release($1,$2,$3) r", [u3, w3.window_id, 2])).rows[0].r, true);
const after = (await db.query("select credits_used, messages_count from public.chat_windows where id=$1", [w3.window_id])).rows[0]; assert.deepEqual([after.credits_used, after.messages_count], [0, 0]);
await db.query("select public.chat_window_release($1,$2,$3)", [u3, w3.window_id, 50]); assert.equal((await db.query("select credits_used from public.chat_windows where id=$1", [w3.window_id])).rows[0].credits_used, 0, "jamais négatif");
const other = await user(); assert.equal((await db.query("select public.chat_window_release($1,$2,$3) r", [other, w3.window_id, 1])).rows[0].r, false, "un autre utilisateur ne peut pas libérer cette fenêtre");
ok("6. échec de livraison : comptage annulé, jamais négatif, impossible de libérer la fenêtre d'un autre compte");

// 7) changement de plan : montée allonge, descente ne raccourcit pas ; plan inconnu = règle free
const u4 = await user(); const f = await enter(u4, "free", 1); const up = await enter(u4, "ultra", 1);
assert.equal(up.window_id, f.window_id); assert.equal(Math.round((new Date(up.ends_at) - new Date(up.started_at)) / 60000), 720);
const down = await enter(u4, "free", 1); assert.equal(Math.round((new Date(down.ends_at) - new Date(down.started_at)) / 60000), 720, "une descente ne raccourcit jamais");
const legacy = await enter(await user(), "monthly", 1); assert.equal(Math.round((new Date(legacy.ends_at) - new Date(legacy.started_at)) / 60000), 210);
ok("7. montée de plan : fenêtre allongée ; descente : jamais raccourcie ; ancienne formule : règle Free");

// 8) arguments invalides rejetés ; droits
await assert.rejects(() => db.query("select * from public.chat_window_enter(null,'free',1)"), /invalid_arguments/);
await assert.rejects(() => db.query("select * from public.chat_window_enter(gen_random_uuid(),'free',-1)"), /invalid_arguments/);
const acl = (await db.query("select grantee, privilege_type from information_schema.routine_privileges where routine_name='chat_window_enter' and grantee in ('anon','authenticated','PUBLIC','service_role')")).rows.map(r => r.grantee).sort();
assert.deepEqual(acl, ["service_role"], "seul le serveur peut appeler la fonction");
ok("8. arguments invalides rejetés ; seule la clé serveur (service_role) peut exécuter les fonctions");
console.log(`chat-windows: ${n} groupes OK`);
