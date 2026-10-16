import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const roots = [path.join(root, 'src/app/dashboard'), path.join(root, 'src/app/admin')];
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(p);
  }
}
roots.forEach(walk);

const actionFiles = files.filter(f => /actions\.(ts|tsx)$/.test(f));
const failures = [];
for (const file of actionFiles) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('"use server"') && !src.includes("'use server'")) continue;
  const isAdmin = file.includes(`${path.sep}admin${path.sep}`);
  const auth = isAdmin
    ? /requireAdmin\s*\(/.test(src)
    : /(requireAgeVerifiedUser|getSessionProfile|auth\.getUser\s*\(|createClient\s*\()/.test(src);
  if (!auth) failures.push(path.relative(root, file));
}

if (failures.length) {
  console.error('server-authorization-contract: FAIL');
  failures.forEach(f => console.error(` - ${f}`));
  process.exit(1);
}
console.log(`server-authorization-contract: OK (${actionFiles.length} action files scanned)`);
