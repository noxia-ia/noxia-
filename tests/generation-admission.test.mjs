import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/migrations/0023_atomic_generation_admission.sql', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/lib/generations.ts', import.meta.url), 'utf8');

assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /status in \('pending','processing'\)/);
assert.match(sql, /generation_in_flight/);
assert.match(sql, /revoke insert on public\.generations from anon, authenticated/);
assert.match(sql, /grant execute on function public\.create_generation_atomic.*service_role/s);
assert.match(service, /rpc\("create_generation_atomic"/);
assert.doesNotMatch(service, /\.from\("generations"\)\.insert/);
console.log('generation-admission contract tests: ok');
