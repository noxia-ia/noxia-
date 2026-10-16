import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const roots = ["src/app/dashboard", "src/components", "src/modules"];
const forbidden = [/ElevenLabs/gi, /fal\.ai/gi, /\bWan\b/g];
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
  }
}
for (const r of roots) walk(path.join(root, r));
const leaks = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const re of forbidden) {
    if (re.test(text)) leaks.push(`${path.relative(root, file)}: ${re}`);
    re.lastIndex = 0;
  }
}
assert.deepEqual(leaks, [], `Provider names leaked into user-facing source:\n${leaks.join("\n")}`);
console.log(`provider-visibility: OK (${files.length} UI source files scanned)`);
