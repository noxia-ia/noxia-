// Test SQL réel du bonus quotidien avec fenêtre de 24h.
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
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
`);
const files = fs.readdirSync(MIG).filter(f => f.endsWith(".sql")).sort();
for (const f of files) await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
let n = 0; const ok = m => { n++; process.stdout.write(`  ✔ ${m}\n`); };
const as = async (role, sub, fn) => { await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]); try { return await fn(); } finally { await db.exec("reset role"); } };
const fails = async (fn, re) => { try { await fn(); } catch (e) { assert.match(String(e.message), re, e.message); return; } assert.fail(`aucune erreur (attendu : ${re})`); };
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const mkUser = async email => (await one("insert into auth.users(email) values ($1) returning id", [email])).id;
const claim = uid => as("authenticated", uid, async () => (await db.query("select * from public.claim_daily_credit()")).rows[0]);
const credits = async uid => (await one("select credits from public.profiles where user_id=$1", [uid])).credits;
const setClaimAt = async (uid, iso) => {
  await db.query("update public.daily_credit_streaks set last_claim_at=$2::timestamptz, last_claim_date=$2::date where user_id=$1", [uid, iso]);
};

ok(`migrations ${files[0].slice(0, 4)} → ${files.at(-1).slice(0, 4)} exécutées sans erreur`);
const alice = await mkUser("alice@example.test");
const start = await credits(alice);
const expected = [1, 1, 1, 2, 2, 3, 5, 1, 1, 1];
let total = 0;
let base = new Date("2026-10-10T08:10:20Z");

// Premier claim.
let r = await claim(alice); // now() réel ; on conserve ensuite son timestamp DB pour les simulations.
total += 1;
assert.equal(r.streak_day, 1);
assert.equal(r.credits_granted, 1);
assert.equal(await credits(alice), start + total);
ok("premier claim → J1 +1");

const actualClaim = (await one("select last_claim_at from public.daily_credit_streaks where user_id=$1", [alice])).last_claim_at;

// Avant 24h : refus.
r = await claim(alice);
assert.deepEqual([r.claimed, r.already_claimed, r.credits_granted], [false, true, 0]);
assert.equal(await credits(alice), start + total);
ok("avant 24h → refusé, aucun crédit");

// Simule exactement 24h après le dernier claim.
const nowForTest = new Date();
await setClaimAt(alice, new Date(nowForTest.getTime() - 24 * 60 * 60 * 1000).toISOString());
r = await claim(alice);
assert.equal(r.claimed, true);
assert.equal(r.streak_day, 2);
assert.equal(r.credits_granted, 1);
total += 1;
ok("24h écoulées → J2 +1");

// Simule un claim à 49h du précédent : reset J1.
await setClaimAt(alice, new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString());
r = await claim(alice);
assert.equal(r.streak_day, 1);
assert.equal(r.credits_granted, 1);
ok("48h ou plus sans claim → reset J1 +1");

// Protection client/RLS.
await fails(() => as("authenticated", alice, () => db.query("update public.daily_credit_streaks set streak_day = 7 where user_id = $1", [alice])), /permission denied/i);
await fails(() => as("authenticated", alice, () => db.query("delete from public.daily_credit_claims where user_id = $1", [alice])), /permission denied/i);
ok("client : écriture directe sur streak/claims refusée");

console.log(`\ndaily-streak SQL tests: ${n} blocs OK`);
await db.close();
