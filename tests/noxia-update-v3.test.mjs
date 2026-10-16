import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOXIA_IDENTITY_BLOCK, NOXIA_CREATOR } from "../src/lib/ai/identity.ts";
import { parseSupportTicket } from "../src/lib/support-ticket.ts";
import { signJobBody, verifyJobSignature } from "../src/lib/jobs/sign.ts";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// 1) Identité : créateur, pseudos, origine, anniversaire ; communiqués seulement sur demande.
for (const s of ["LYJC", "Zapparroo", "Dr Dark", "Togo", "23 octobre"]) assert.ok(NOXIA_IDENTITY_BLOCK.includes(s), `identité : ${s}`);
assert.match(NOXIA_IDENTITY_BLOCK, /UNIQUEMENT lorsque l'utilisateur demande/);
assert.equal(NOXIA_CREATOR.origin, "Togo");
assert.match(read("src/lib/ai/providers/agents/shared.ts"), /NOXIA_IDENTITY_BLOCK/);

// 2) Support : validation des tickets.
const fd = o => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
assert.equal(parseSupportTicket(fd({ category: "assistance", email: "a@b.co", message: "Mon compte est bloqué" })).ok, true);
assert.equal(parseSupportTicket(fd({ category: "assistance", email: "pas-un-mail", message: "Mon compte est bloqué" })).ok, false);
assert.equal(parseSupportTicket(fd({ category: "assistance", email: "a@b.co", message: "court" })).ok, false);
assert.equal(parseSupportTicket(fd({ category: "hack", email: "a@b.co", message: "Un message assez long" })).ok, false);
assert.equal(parseSupportTicket(fd({ category: "partnership", email: "a@b.co", message: "Demande de publicité" })).ok, false, "entreprise obligatoire");
assert.equal(parseSupportTicket(fd({ category: "partnership", email: "a@b.co", company: "ACME", message: "Demande de publicité" })).ok, true);
assert.equal(parseSupportTicket(fd({ category: "assistance", email: "a@b.co", message: "Un message assez long", website: "http://spam" })).ok, false, "champ piège");
const sql = read("supabase/migrations/0055_support_and_jobs.sql");
assert.match(sql, /revoke all on public\.support_tickets from anon, authenticated/);
assert.match(sql, /create table if not exists public\.provider_jobs/);
assert.match(read("src/app/layout.tsx"), /<SupportBubble \/>/);
assert.match(read("src/app/admin/support/page.tsx"), /requireAdmin/);

// 3) Admin : bouton visible uniquement pour role === 'admin' ; /admin protégé côté serveur.
assert.match(read("src/app/dashboard/layout.tsx"), /isAdmin=\{profile\?\.role === "admin"\}/);
assert.match(read("src/components/shell/AppShell.tsx"), /\{isAdmin && <Link href="\/admin"/);
assert.match(read("src/components/dashboard/Sidebar.tsx"), /\{isAdmin && \(/);
assert.match(read("src/lib/auth.ts"), /role !== "admin"\) redirect\("\/"\)/);
assert.match(read("src/app/admin/layout.tsx"), /await requireAdmin\(\)/);

// 4) Vidéo asynchrone : signature HMAC de la fonction de fond.
const secret = "s".repeat(32), body = '{"generationId":"x"}', ts = Date.now();
const sig = signJobBody(secret, ts, body);
assert.equal(verifyJobSignature(secret, ts, body, sig), true);
assert.equal(verifyJobSignature(secret, ts, body + " ", sig), false, "corps modifié");
assert.equal(verifyJobSignature("autre-secret", ts, body, sig), false, "mauvais secret");
assert.equal(verifyJobSignature(secret, ts - 6 * 60_000, body, signJobBody(secret, ts - 6 * 60_000, body)), false, "signature périmée");
assert.equal(verifyJobSignature(secret, ts, body, "zz"), false);
const bg = read("netlify/functions/video-render-background.mts");
assert.match(bg, /validSignature\(secret/); assert.match(bg, /status: 202/); assert.match(bg, /provider_jobs/);
const pol = read("src/lib/ai/providers/video/pollinations.ts");
assert.match(pol, /video-render-background/); assert.match(pol, /async getJob\(/);
assert.match(read("src/lib/providers/register.ts"), /id: "pollinations", name: "Pollinations", module: "video"[^\n]*supportsAsync: true, supportsPolling: true/);
assert.match(read("src/components/video/VideoHistory.tsx"), /setInterval/);

// 5) Image Pollinations : enregistrée, avec le Prompt Enhancer NOXIA et sans double enrichissement.
assert.match(read("src/lib/providers/register.ts"), /id: "pollinations", name: "Pollinations \(image\)", module: "image"/);
const img = read("src/lib/ai/providers/image/pollinations.ts");
assert.match(img, /optimizeImagePrompt/); assert.match(img, /enhance: "false"/); assert.match(img, /Authorization: `Bearer/);

// 6) Orbe vocale + design verre.
assert.match(read("src/components/voice/NoxiaVoiceControls.tsx"), /<VoiceOrb state=\{state\} levelRef=\{levelRef\}/);
assert.match(read("src/components/voice/NoxiaVoiceControls.tsx"), /speechSynthesis/);
assert.match(read("src/styles/globals.css"), /\.nx-orb-core/);
assert.match(read("src/styles/globals.css"), /rgba\(255,255,255,\.03\)/);
assert.match(read("src/components/shell/AppShell.tsx"), /nx-ui2/);
console.log("noxia-update-v3: OK");
