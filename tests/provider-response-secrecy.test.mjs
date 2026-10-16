import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules','.next','.git'].includes(entry.name)) walk(p);
    else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(p);
  }
}
walk(path.join(root, 'src/app/api'));
const forbiddenResponsePatterns = [
  /provider\s*[:=]/i,
  /providerId/i,
  /ELEVENLABS_API_KEY/i,
  /api\.elevenlabs\.io/i,
  /fal\.ai/i,
];
let violations = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  // Only inspect literal JSON response payloads / user-facing error strings.
  for (const re of forbiddenResponsePatterns) {
    for (const line of text.split('\n')) {
      if ((line.includes('NextResponse.json') || line.includes('NextResponse.json(') || line.includes('return new Response')) && re.test(line)) {
        violations.push(`${path.relative(root,file)}: ${line.trim()}`);
      }
    }
  }
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`provider-response-secrecy: OK (${files.length} API source files scanned)`);
