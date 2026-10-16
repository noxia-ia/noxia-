// Test SQL RÉEL (PGlite) de la migration 0026 : préférences de profil, trigger d'inscription, prix, audience admin.
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
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const mk = async (email, meta = {}) => (await one("insert into auth.users(email, raw_user_meta_data) values ($1, $2::jsonb) returning id", [email, JSON.stringify({ date_of_birth: "1990-01-01", ...meta })])).id;
const prof = uid => one("select country_code, locale, display_currency, credits from public.profiles where user_id=$1", [uid]);

const a = await mk("a@x.test", { country_code: "tg", locale: "EN", display_currency: "eur" });
assert.deepEqual(await prof(a), { country_code: "TG", locale: "en", display_currency: "EUR", credits: 5 });
ok("inscription : préférences normalisées, 5 crédits de découverte conservés (logique 0017)");
const b = await mk("b@x.test", { country_code: "ZZZ", locale: "x", display_currency: "GBP" });
assert.deepEqual(await prof(b), { country_code: null, locale: "fr", display_currency: "XOF", credits: 5 });
ok("valeurs invalides ignorées (pays NULL, fr, XOF) sans bloquer l'inscription");
await fails(() => mk("minor@x.test", { date_of_birth: "2020-01-01" }), /age_restricted/);
ok("contrôle d'âge < 15 ans toujours actif");

const setp = (uid, ...args) => as("authenticated", uid, () => db.query("select public.set_profile_preferences($1,$2,$3)", args));
await setp(b, "bj", null, "usd");
assert.deepEqual(await prof(b), { country_code: "BJ", locale: "fr", display_currency: "USD", credits: 5 });
ok("set_profile_preferences : seules les valeurs fournies changent");
await fails(() => setp(b, "TOGO", null, null), /invalid_country/);
await fails(() => setp(b, null, "FR_fr!", null), /invalid_locale/);
await fails(() => setp(b, null, null, "GBP"), /invalid_currency/);
await fails(() => as("anon", null, () => db.query("select public.set_profile_preferences('TG')")), /permission denied/i);
await fails(() => as("authenticated", null, () => db.query("select public.set_profile_preferences('TG')")), /unauthenticated/);
ok("valeurs invalides, anon et session absente refusés");
await fails(() => as("authenticated", b, () => db.query("update public.profiles set country_code='FR' where user_id=$1", [b])), /permission denied/i);
await fails(() => as("authenticated", b, () => db.query("update public.profiles set credits=999 where user_id=$1", [b])), /permission denied/i);
ok("écriture directe du pays et des crédits refusée côté client");
await setp(a, "FR", null, null);
assert.equal((await prof(b)).country_code, "BJ");
ok("modifier son profil ne touche jamais celui d'un autre utilisateur");

await fails(() => as("authenticated", a, () => db.query("insert into public.plan_prices(plan,currency,amount_minor) values ('annual','XOF',1)")), /permission denied/i);
assert.equal((await as("authenticated", a, () => db.query("select * from public.plan_prices"))).rows.length, 0);
ok("plan_prices : vide (aucun prix inventé), lecture seule pour le client");

await db.query("update public.profiles set role='admin' where user_id=$1", [a]);
const rows = (await as("authenticated", a, () => db.query("select * from public.admin_audience_breakdown('country')"))).rows;
assert.equal(rows.length, 2); assert.equal(Number(rows[0].users), 1);
assert.equal(rows.reduce((s, r) => s + Number(r.pct), 0), 100);
await fails(() => as("authenticated", b, () => db.query("select * from public.admin_audience_breakdown('country')")), /forbidden/);
await fails(() => as("authenticated", a, () => db.query("select * from public.admin_audience_breakdown('email')")), /invalid_dimension/);
ok("audience agrégée : admin uniquement, sans donnée individuelle, dimension validée");
console.log(`\nprofile-preferences SQL tests: ${n} blocs OK`); await db.close();
