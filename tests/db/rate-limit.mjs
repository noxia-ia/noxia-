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
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
`);
for (const f of fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));

const user = (await db.query("insert into auth.users(email) values ('rate@test') returning id")).rows[0].id;
const as = async (role, sub, fn) => {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sub ?? ""]);
  try { return await fn(); } finally { await db.exec("reset role"); }
};
const slot = async (module, limit, window=60) => (await as('authenticated', user, () => db.query("select public.consume_generation_rate_slot($1,$2,$3) as ok", [module, limit, window]))).rows[0].ok;

assert.equal(await slot('image', 2), true);
assert.equal(await slot('image', 2), true);
assert.equal(await slot('image', 2), false);
assert.equal(await slot('video', 2), true);
await assert.rejects(() => slot('image', 2, 0), /invalid_window/);

await db.exec("update public.generation_rate_limit_buckets set window_started_at = now() - interval '61 seconds' where user_id = '" + user + "'");
assert.equal(await slot('image', 2), true);

try {
  await as('anon', null, () => db.query("select public.consume_generation_rate_slot('image',2,60)"));
  assert.fail('anon call should fail');
} catch (e) {
  assert.match(String(e.message), /permission denied|not_authenticated/);
}

console.log('atomic rate-limit tests: ok');
await db.close();
