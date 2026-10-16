import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migrations = path.join(root, 'supabase/migrations');
const files = fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).sort();
const sql = files.map(f => fs.readFileSync(path.join(migrations, f), 'utf8')).join('\n');

// Every table carrying an auth.users ownership FK must be RLS-protected.
const ownedTables = new Set();
for (const m of sql.matchAll(/create table(?: if not exists)? public\.([a-zA-Z0-9_]+)[\s\S]*?references auth\.users\(id\) on delete cascade/gi)) ownedTables.add(m[1]);
assert(ownedTables.size > 0, 'no auth-owned tables discovered');
for (const table of ownedTables) {
  const re = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i');
  assert(re.test(sql), `${table}: RLS is not enabled`);
}

// User-facing Server Actions using the privileged client must scope destructive reads/writes by the session user.
const actionDir = path.join(root, 'src/app/dashboard');
const actionFiles = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'actions.ts') actionFiles.push(p);
  }
}
walk(actionDir);
for (const file of actionFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('createAdminClient')) continue;
  if (file.endsWith(path.join('dashboard', 'creations', 'actions.ts'))) {
    assert.match(text, /eq\("user_id",\s*user\.id\)/, `${file}: privileged generation delete must be user-scoped`);
  }
  if (file.endsWith(path.join('dashboard', 'settings', 'actions.ts'))) {
    assert.match(text, /eq\("user_id",\s*user\.id\)/, `${file}: privileged account cleanup must be user-scoped`);
  }
}

console.log(`ownership-isolation-contract: OK (${ownedTables.size} auth-owned tables, ${actionFiles.length} dashboard action files scanned)`);
