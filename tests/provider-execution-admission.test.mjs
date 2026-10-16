import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "src/app/dashboard");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (p.endsWith("actions.ts")) files.push(p);
  }
}
walk(root);

function callChunks(text, name) {
  const chunks = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  let m;
  while ((m = re.exec(text))) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let end = m.index;
    for (let i = m.index + m[0].length - 1; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    chunks.push(text.slice(m.index, end));
  }
  return chunks;
}

const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const calls = callChunks(text, "executeProvider");
  if (!calls.length) continue;
  if (!text.includes("generationGateway")) {
    failures.push(`${file}: executeProvider sans generationGateway`);
    continue;
  }
  calls.forEach((chunk, index) => {
    if (!/\bgenerationId\b/.test(chunk)) failures.push(`${file}: executeProvider #${index + 1} sans generationId`);
  });
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`provider execution admission: OK (${files.length} action files scanned)`);
