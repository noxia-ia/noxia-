// Contrôles du câblage des pièces jointes : détection par les octets, noms non fiables, prix serveur, sécurité de la route, de la migration et du client.
import assert from "node:assert/strict";
import fs from "node:fs";
import { sniffType, sanitizeName } from "../src/lib/attachments/sniff.ts";
const read = p => fs.readFileSync(p, "utf8");
let n = 0; const ok = t => { n++; console.log(`  ✔ ${t}`); };
const pad = (a, len = 64) => new Uint8Array([...a, ...new Array(len).fill(0)]);

// 1) type déterminé par les octets
assert.deepEqual(sniffType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime, "image/png");
assert.equal(sniffType(pad([0xff, 0xd8, 0xff, 0xe0]))?.mime, "image/jpeg");
assert.equal(sniffType(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.mime, "image/webp");
assert.equal(sniffType(pad([0x50, 0x4b, 0x03, 0x04]))?.kind, "zip");
for (const bad of [[0x4d, 0x5a], [0x7f, 0x45, 0x4c, 0x46], [0x3c, 0x73, 0x76, 0x67], [0x25, 0x50, 0x44, 0x46], [0x47, 0x49, 0x46, 0x38], [0x23, 0x21, 0x2f, 0x62]]) assert.equal(sniffType(pad(bad)), null, "exécutable, SVG, PDF, GIF, script : refusés");
assert.equal(sniffType(new Uint8Array(0)), null);
ok("1. PNG/JPEG/WebP/ZIP reconnus par leurs octets ; .exe, ELF, SVG, PDF, GIF, scripts refusés");

// 2) noms non fiables
assert.equal(sanitizeName("../../etc/passwd"), "passwd"); assert.equal(sanitizeName("C:\\Users\\x\\photo.png"), "photo.png");
assert.equal(sanitizeName("a\u0000b<script>.png"), "abscript.png"); assert.equal(sanitizeName(""), "fichier"); assert.equal(sanitizeName("x".repeat(500)).length, 120);
ok("2. noms de fichiers : chemins, caractères de contrôle et balises retirés, longueur bornée");

// 3) prix et crédits côté serveur
const actions = read("src/app/dashboard/agents/actions.ts");
assert.match(actions, /claimForSend\(user\.id, ids\)/); assert.match(actions, /chatMessageCreditCost\(attached\.map\(a => a\.kind\)\)/);
assert.doesNotMatch(actions, /attachmentIds[^;\n]*cost|cost[^;\n]*attachmentIds/i, "le prix ne dépend jamais d'une valeur du navigateur");
assert.match(actions, /credits: cost/); assert.match(actions, /completeAssistantMessage\(assistantId, reply, cost\)/);
assert.match(actions, /supportsVision/); assert.match(actions, /finishAttachments\(user\.id, attached, userMessageId\)/);
assert.match(actions, /failAssistantMessage\(assistantId, loaded\.message\)/, "échec de lecture d'une pièce : réservation remboursée");
assert.doesNotMatch(read("src/lib/agent-chat.ts"), /rpc\("consume_credits"/);
ok("3. prix 1 ou 2 crédits calculé par le serveur depuis les pièces validées ; réservation/finalisation existantes réutilisées ; remboursement sur échec ; vision exigée pour les images");

// 4) route : authentification, âge, origine, pas de cache
const route = read("src/app/api/chat/attachments/route.ts");
assert.match(route, /requireAgeVerifiedUser/); assert.match(route, /sameOrigin\(request\)/); assert.match(route, /no-store/); assert.match(route, /UUID_RE\.test\(id\)/);
assert.ok(route.indexOf("requireAgeVerifiedUser") < route.indexOf("formData()"), "authentification AVANT la lecture du fichier");
ok("4. route : origine vérifiée, session + âge AVANT lecture du fichier, réponses non mises en cache, identifiant validé");

// 5) migration : bucket privé, aucune écriture navigateur, RLS
const sql = read("supabase/migrations/0050_chat_attachments.sql");
assert.match(sql, /false, 5242880/); assert.match(sql, /enable row level security/); assert.match(sql, /revoke all on public\.chat_attachments from anon, authenticated/);
assert.match(sql, /grant select on public\.chat_attachments to authenticated/); assert.doesNotMatch(sql, /grant (insert|update|delete)/i); assert.doesNotMatch(sql, /drop table|truncate|delete from|drop policy (?!if exists "chat_attachments_select_own")/i);
assert.doesNotMatch(sql, /storage\.objects/i, "aucune politique de stockage : seul le serveur y accède");
assert.doesNotMatch(sql, /profiles|subscriptions|credit/i, "ne touche ni crédits, ni abonnements, ni profils");
ok("5. migration 0050 : bucket privé, RLS, lecture de ses propres pièces seulement, aucune écriture navigateur, ne touche pas aux crédits");

// 6) navigateur : aucun import serveur, aucune clé
const ui = read("src/components/chat/HomeChat.tsx");
assert.doesNotMatch(ui, /attachments\/service|server-only|SUPABASE|process\.env/); assert.match(ui, /\/api\/chat\/attachments/);
assert.match(read("src/lib/attachments/service.ts"), /^import "server-only";/m);
ok("6. client : aucun module serveur ni secret ; le service d'envoi est « server-only »");

// 7) suppression de compte et conservation minimale
assert.match(read("src/app/dashboard/settings/actions.ts"), /removeAllAttachmentsForUser\(user\.id\)/);
const svc = read("src/lib/attachments/service.ts");
assert.match(svc, /purged_at: new Date\(\)\.toISOString\(\)/); assert.match(svc, /storage_path: null/);
ok("7. suppression de compte : pièces effacées avant l'utilisateur ; binaires supprimés après traitement, seules les métadonnées restent");
console.log(`attachments-wiring: ${n} groupes OK`);
