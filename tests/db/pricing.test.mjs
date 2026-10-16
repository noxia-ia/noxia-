// Test SQL RÉEL (PGlite) de la migration 0027 : niveaux, prix de référence FCFA, USD/EUR actifs, droits, audit, activation admin.
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
  create publication supabase_realtime;
`);
for (const f of fs.readdirSync(MIG).filter(f => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
let n = 0; const ok = m => { n++; console.log(`  ✔ ${m}`); };
const as = async (role, sub, fn) => { await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]); try { return await fn(); } finally { await db.exec("reset role"); } };
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert.match(String(e.message), re, e.message); return; } assert.fail(`aucune erreur (attendu : ${re})`); };
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const mk = async email => (await q("insert into auth.users(email, raw_user_meta_data) values ($1, '{\"date_of_birth\":\"1990-01-01\"}'::jsonb) returning id", [email]))[0].id;
const user = await mk("u@x.test"), admin = await mk("adm@x.test");
await db.query("update public.profiles set role='admin' where user_id=$1", [admin]);
const price = (plan, cur) => q("select amount_minor::int a, active, is_reference r from public.plan_prices where plan=$1 and currency=$2", [plan, cur]);

// 1) prix officiels seedés
assert.deepEqual([await price("plus", "XOF"), await price("pro", "XOF"), await price("ultra", "XOF"), await price("free", "XOF")].map(r => [r[0].a, r[0].active, r[0].r]),
  [[2500, true, true], [6000, true, true], [15000, true, true], [0, true, true]]);
ok("prix de référence FCFA officiels : Plus 2 500, Pro 6 000, Ultra 15 000, Free 0");
assert.deepEqual((await q("select plan, currency, amount_minor::int a, active from public.plan_prices where currency in ('USD','EUR') order by plan, currency")).map(r => [r.plan, r.currency, r.a, r.active]),
  [["free","EUR",0,true],["free","USD",0,true],["plus","EUR",499,true],["plus","USD",499,true],["pro","EUR",1199,true],["pro","USD",1199,true],["ultra","EUR",2999,true],["ultra","USD",2999,true]]);
ok("prix USD/EUR actifs : Plus 4,99, Pro 11,99, Ultra 29,99 dans chaque devise");
assert.equal((await q("select * from public.plan_prices where currency <> 'XOF' and active")).length, 8);

// 2) lecture : anon et connecté ne voient que les prix actifs ; aucune écriture directe
assert.equal((await as("anon", null, () => db.query("select * from public.plan_prices"))).rows.length, 12);
assert.equal((await as("authenticated", user, () => db.query("select * from public.plan_prices"))).rows.length, 12);
ok("anon et utilisateur : seuls les prix actifs XOF/USD/EUR sont lisibles");
for (const sql of ["insert into public.plan_prices(plan,currency,amount_minor) values ('plus','USD',1)", "update public.plan_prices set amount_minor = 1", "delete from public.plan_prices"]) {
  await fails(() => as("authenticated", user, () => db.query(sql)), /permission denied/i);
  await fails(() => as("anon", null, () => db.query(sql)), /permission denied/i);
}
ok("écriture directe sur plan_prices refusée (anon et connecté)");
await fails(() => db.query("insert into public.plan_prices(plan,currency,amount_minor,is_reference) values ('daily','USD',100,true)"), /plan_prices_reference_is_xof|check/i);
await fails(() => db.query("insert into public.plan_prices(plan,currency,amount_minor) values ('gold','XOF',100)"), /check/i);
ok("contraintes : référence = FCFA uniquement, plan inconnu refusé");

// 3) modification des prix : admin uniquement + audit
const setp = (uid, ...a) => as("authenticated", uid, () => db.query("select public.admin_set_plan_price($1,$2,$3,$4)", a));
await fails(() => setp(user, "plus", "XOF", 3000, true), /not_authorized/);
await fails(() => as("anon", null, () => db.query("select public.admin_set_plan_price('plus','XOF',3000,true)")), /permission denied/i);
ok("changement de prix refusé aux non-admins");
await fails(() => setp(admin, "plus", "XOF", 2500, false), /reference_price_must_stay_active/);
await fails(() => setp(admin, "plus", "USD", -1, true), /invalid_amount/);
await fails(() => setp(admin, "plus", "GBP", 1, true), /invalid_currency/);
await fails(() => setp(admin, "gold", "XOF", 1, true), /invalid_plan/);
await fails(() => setp(admin, "free", "XOF", 10, true), /free_plan_must_be_zero/);
await fails(() => setp(admin, "monthly", "USD", 500, true), /reference_price_required/);
ok("règles : FCFA de référence toujours actif, montants/devises/plans validés, pas de USD/EUR actif sans référence FCFA");
await setp(admin, "plus", "USD", 499, true);
assert.equal((await as("anon", null, () => db.query("select * from public.plan_prices"))).rows.length, 12);
await setp(admin, "plus", "XOF", 2500, true);
const audit = await as("authenticated", admin, () => db.query("select plan, currency, old_amount_minor::int o, new_amount_minor::int n, old_active, new_active, admin_id from public.plan_price_audit order by created_at, id"));
assert.equal(audit.rows.length, 2); assert.equal(audit.rows[0].admin_id, admin); assert.equal(audit.rows[0].new_active, true); assert.equal(audit.rows[0].old_active, false);
assert.equal((await as("authenticated", user, () => db.query("select * from public.plan_price_audit"))).rows.length, 0);
await fails(() => as("anon", null, () => db.query("select * from public.plan_price_audit")), /permission denied/i);
ok("prix USD activé par l'admin → visible ; changements journalisés ; audit invisible pour les non-admins");

// 4) activation admin des nouveaux niveaux, anciennes formules conservées
const act = (uid, target, plan) => as("authenticated", uid, () => db.query("select public.admin_update_subscription($1,'activate',$2, now(), now() + interval '30 days', 0)", [target, plan]));
await act(admin, user, "plus");
assert.equal((await q("select plan from public.subscriptions where user_id=$1 order by created_at desc limit 1", [user]))[0].plan, "plus");
for (const plan of ["pro", "ultra", "daily", "weekly", "monthly", "annual"]) await act(admin, user, plan);
await fails(() => act(admin, user, "free"), /invalid_plan_or_dates/);
await fails(() => act(admin, user, "gold"), /invalid_plan_or_dates/);
await fails(() => act(user, user, "plus"), /not_authorized/);
ok("activation admin : plus/pro/ultra + daily/weekly/monthly/annual acceptés ; free, inconnu et non-admin refusés");
await fails(() => db.query("insert into public.subscriptions(user_id, plan) values ($1,'gold')", [user]), /check/i);
await db.query("insert into public.subscriptions(user_id, plan) values ($1,'ultra')", [admin]);
ok("contrainte subscriptions.plan : niveaux acceptés, plan inconnu refusé");
console.log(`\npricing SQL tests: ${n} blocs OK`); await db.close();
