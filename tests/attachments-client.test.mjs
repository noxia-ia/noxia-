// Utilitaires du menu « + » : classement des fichiers, ZIP « dossier », compatibilité avec l'analyseur ZIP sécurisé du serveur.
import assert from "node:assert/strict";
import { classifyFile, buildStoredZip, crc32, folderToZip, SERVER_SUPPORT } from "../src/lib/attachments/client.ts";
import { analyzeZip } from "../src/lib/attachments/zip.ts";
import { sniffType } from "../src/lib/attachments/sniff.ts";
let n = 0; const ok = t => { n++; console.log(`  ✔ ${t}`); };

assert.equal(classifyFile({ name: "a.PNG", type: "" }), "image"); assert.equal(classifyFile({ name: "x", type: "image/webp" }), "image");
assert.equal(classifyFile({ name: "p.zip", type: "" }), "zip"); assert.equal(classifyFile({ name: "p.rar", type: "" }), "rar");
assert.equal(classifyFile({ name: "d.pdf", type: "application/pdf" }), "pdf"); assert.equal(classifyFile({ name: "run.exe", type: "" }), null);
ok("1. images, ZIP, RAR, PDF reconnus ; .exe refusé");

assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
ok("2. CRC-32 conforme (valeur de référence 0xCBF43926)");

const zip = buildStoredZip([{ path: "proj/README.md", data: new TextEncoder().encode("# Démo") }, { path: "proj/src/a.ts", data: new TextEncoder().encode("export const a = 1;") }]);
assert.equal(sniffType(zip)?.kind, "zip");
const r = analyzeZip(zip); assert.equal(r.ok, true, JSON.stringify(r));
ok("3. le ZIP « dossier » est reconnu et accepté par l'analyseur sécurisé du serveur");

class F { constructor(parts, name, o = {}) { this.p = parts[0]; this.name = name; this.size = parts[0].length; this.webkitRelativePath = o.rel ?? ""; this.type = o.type ?? ""; } async arrayBuffer() { return new TextEncoder().encode(this.p).buffer; } }
globalThis.File = F;
const res = await folderToZip([new F(["hi"], "a.txt", { rel: "mon/a.txt" }), new F(["x"], "i.js", { rel: "mon/node_modules/l/i.js" }), new F(["S=1"], ".env", { rel: "mon/.env" })], 1e6);
assert.equal(res.ok, true); assert.equal(res.kept, 1); assert.equal(res.skipped, 2); assert.equal(res.file.name, "mon.zip");
ok("4. dossier : node_modules et .env écartés, archive nommée d'après le dossier");
assert.equal((await folderToZip([new F(["x"], "i.js", { rel: "d/node_modules/i.js" })], 1e6)).ok, false);
assert.equal(SERVER_SUPPORT.pdf, true); assert.equal(SERVER_SUPPORT.rar, true);
ok("5. dossier vide après nettoyage refusé ; PDF/RAR signalés pris en charge côté serveur");
console.log(`attachments-client: ${n} contrôles OK`);
