// Banc de test Cloudflare Workers AI (texte AGENTS + image FLUX) : exécute le VRAI code du projet avec un FAUX fetch et un FAUX Supabase. Aucun réseau, aucune vraie clé.
// Il ne prouve PAS que Cloudflare répond : seulement la forme de la requête, la validation, la bascule et la gestion d'erreurs. Lancer : npm run test:cloudflare


import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as FX from "./fixtures.mjs";

const ACC = "0123456789abcdef0123456789abcdef", KEY = "cf_TESTKEY_NOT_A_REAL_SECRET_123456", SVC = "SERVICEKEY_NOT_REAL_987654";
const UID = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", GID = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
Object.assign(process.env, { CLOUDFLARE_API_TOKEN: KEY, CLOUDFLARE_ACCOUNT_ID: ACC, CLOUDFLARE_MODEL_AGENT: "@cf/test-org/test-model", AGENT_PROVIDER: "cloudflare", AGENT_PROVIDER_FALLBACK: "openrouter", OPENROUTER_API_KEY: "OR_TESTKEY_NOT_REAL", OPENROUTER_MODEL_AGENT: "test/or-model", IMAGE_PROVIDER: "cloudflare", STORAGE_PROVIDER: "supabase-storage", NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SECRET_KEY: SVC });
const logs = []; const origInfo = console.info; console.info = (...a) => logs.push(a.join(" "));

// ---- faux fetch
let calls = [], handler = null;
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
const img = (bytes, type = "image/png", extra = {}) => new Response(bytes, { status: 200, headers: { "content-type": type, ...extra } });
const status = (st, body = { error: "SECRET_DETAIL_" + KEY }) => new Response(JSON.stringify(body), { status: st, headers: { "content-type": "application/json" } });

// ---- faux Supabase (stockage + tables + rpc)
const S = { files: new Map(), rows: [], uploads: 0, failUploadAt: 0, failInsert: false, failRemove: false, credits: 5, rpc: [], rpcImpl: () => ({ error: null }) };
const generic = res => new Proxy(function () {}, { get: (_, k) => (k === "then" ? (f, r) => Promise.resolve(res).then(f, r) : () => generic(res)) });
globalThis.__fakeSupabase = {
  storage: { from: bucket => ({
    upload: async (p, bytes, opts) => { S.uploads++; if (S.failUploadAt === S.uploads || S.files.has(p)) return { error: { message: "x" } }; S.files.set(p, { bytes, opts, bucket }); return { data: { path: p }, error: null }; },
    getPublicUrl: p => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${p}` } }),
    remove: async ps => { if (S.failRemove) return { error: { message: "x" } }; ps.forEach(p => S.files.delete(p)); return { data: [], error: null }; },
  }) },
  from: t => t === "stored_assets"
    ? { insert: async row => (S.failInsert ? { error: { message: "x" } } : (S.rows.push(row), { error: null })), delete: () => ({ eq: async (c, v) => { S.rows = S.rows.filter(r => r[c] !== v); return { error: null }; } }) }
    : t === "profiles" ? generic({ data: { credits: S.credits }, error: null }) : generic({ data: null, count: 0, error: null }),
  rpc: async (name, args) => { S.rpc.push({ name, args }); return S.rpcImpl(name, args); },
};
const resetAll = () => { calls = []; handler = null; S.files.clear(); S.rows = []; S.uploads = 0; S.failUploadAt = 0; S.failInsert = false; S.failRemove = false; S.credits = 5; S.rpc = []; S.rpcImpl = () => ({ error: null }); };

const registry = await import("@/lib/providers/registry.ts");
const { executeProvider } = await import("@/lib/providers/execute.ts");
const { validateJobWith } = await import("@/lib/providers/pipeline.ts");
const { parseImageResult } = await import("@/lib/ai/image/validate.ts");

let n = 0; const ok = name => { n++; process.stdout.write(`  ✔ ${name}\n`); };
const json = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
const AGENT = { name: "NOXIA", description: "", objective: "", role: "compagnon", instructions: "Aide l'utilisateur.", domain: "", personality: "friendly", personalityCustom: null, creativity: "medium", language: "fr" };
const sendMsg = (message = "Bonjour", conversation = []) => executeProvider("agents", (p, signal) => p.sendMessage({ agent: AGENT, conversation, message, context: { memory: "" } }, { signal }),
  r => { if (r.status !== "completed" || !r.reply.trim()) throw Object.assign(new Error("x"), { code: "RESULT_INVALID" }); return r; }, { generationId: GID });
const CF_URL = `https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/@cf/test-org/test-model`;

// A) texte : succès + forme exacte de la requête
resetAll(); handler = () => json({ result: { response: "Salut ! Comment puis-je aider ?" }, success: true });
let r = await sendMsg("Bonjour", [{ role: "user", content: "Avant" }, { role: "assistant", content: "Réponse avant" }]);
assert.equal(r.ok, true); assert.equal(r.providerId, "cloudflare"); assert.equal(r.value.reply, "Salut ! Comment puis-je aider ?"); assert.equal(calls.length, 1);
const c0 = calls[0], b0 = JSON.parse(c0.init.body);
assert.equal(c0.url, CF_URL); assert.equal(c0.init.method, "POST"); assert.equal(c0.init.headers.Authorization, `Bearer ${KEY}`); assert.equal(c0.init.redirect, "error");
assert.deepEqual(Object.keys(b0).sort(), ["max_tokens", "messages", "temperature"]);
assert.equal(b0.messages[0].role, "system"); assert.match(b0.messages[0].content, /RÈGLES NON NÉGOCIABLES/); assert.equal(b0.messages.at(-1).content, "Bonjour"); assert.equal(b0.messages.length, 4);
assert.ok(!JSON.stringify(b0).includes(KEY), "le jeton ne doit pas être dans le corps");
ok("A1. texte : POST …/ai/run/<modèle>, Bearer en-tête seulement, corps { messages, temperature, max_tokens }, règles de sécurité en tête du prompt, historique conservé");

// B) erreurs normalisées + bascule vers OpenRouter (secours)
resetAll(); handler = url => url.startsWith("https://api.cloudflare.com") ? json({}, 503) : json({ choices: [{ message: { content: "Réponse de secours" }, finish_reason: "stop" }] });
r = await sendMsg();
assert.equal(r.ok, true); assert.equal(r.providerId, "openrouter"); assert.equal(r.value.reply, "Réponse de secours");
assert.ok(calls.some(c => c.url.startsWith("https://openrouter.ai")), "le secours doit être appelé");
ok("B1. Cloudflare indisponible (503) : réessai borné puis bascule vers le fournisseur de secours, une seule réponse valide retournée");

resetAll(); handler = url => url.startsWith("https://api.cloudflare.com") ? json({ result: { response: "   " }, success: true }) : json({ choices: [{ message: { content: "OK secours" }, finish_reason: "stop" }] });
r = await sendMsg(); assert.equal(r.ok, true); assert.equal(r.providerId, "openrouter");
ok("B2. réponse vide de Cloudflare : refusée (RESULT_INVALID), jamais présentée à l'utilisateur");

resetAll(); handler = url => url.startsWith("https://api.cloudflare.com") ? json({ success: false, errors: [{ message: "SECRET_DETAIL_" + KEY }], result: null }) : json({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] });
r = await sendMsg(); assert.equal(r.ok, true); assert.equal(r.providerId, "openrouter");
ok("B3. success:false avec statut 200 : traité comme une panne du fournisseur");

resetAll(); handler = () => json({}, 401); process.env.AGENT_PROVIDER_FALLBACK = "";
r = await sendMsg(); assert.equal(r.ok, false); const msg = JSON.stringify(r.error); assert.ok(!msg.includes(KEY) && !msg.includes("SECRET_DETAIL"), "aucun secret dans l'erreur");
process.env.AGENT_PROVIDER_FALLBACK = "openrouter";
ok("B4. 401 sans secours : erreur normalisée, aucun secret ni détail technique renvoyé");

// C) configuration incomplète : jamais de valeur devinée
resetAll(); const savedModel = process.env.CLOUDFLARE_MODEL_AGENT; delete process.env.CLOUDFLARE_MODEL_AGENT; process.env.AGENT_PROVIDER_FALLBACK = "";
r = await sendMsg(); assert.equal(r.ok, false); assert.equal(calls.length, 0, "aucun appel réseau sans modèle");
process.env.CLOUDFLARE_MODEL_AGENT = savedModel; process.env.AGENT_PROVIDER_FALLBACK = "openrouter";
ok("C1. modèle absent : fournisseur indisponible, aucun appel réseau");

resetAll(); const savedAcc = process.env.CLOUDFLARE_ACCOUNT_ID; process.env.CLOUDFLARE_ACCOUNT_ID = "../../evil"; process.env.AGENT_PROVIDER_FALLBACK = "";
handler = () => json({ result: { response: "x" }, success: true });
r = await sendMsg(); assert.equal(r.ok, false); assert.equal(calls.length, 0, "identifiant de compte invalide : aucun appel");
process.env.CLOUDFLARE_ACCOUNT_ID = savedAcc; process.env.AGENT_PROVIDER_FALLBACK = "openrouter";
ok("C2. identifiant de compte falsifié (chemin) : refusé avant tout appel réseau");

// D) image : enregistrement + requête FLUX
resetAll(); handler = () => json({ result: { image: Buffer.from(FX.PNG).toString("base64") }, success: true });
const code = async fn => { try { await fn(); } catch (e) { return e.code ?? `NON_NORMALISÉ:${e.message}`; } return null; };
const run = (count = 1) => executeProvider("image", (p, signal) => p.generate({ prompt: "A cinematic landscape of a tropical city at sunset", style: "cinematic", ratio: "16:9", quality: "hd", count, format: "png" }, { signal, userId: UID, generationId: GID }), validateJobWith(v => parseImageResult(v, count)), { generationId: GID });
r = await run(1); assert.equal(r.ok, true); assert.equal(r.providerId, "cloudflare"); assert.equal(calls.length, 1);
assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/@cf/black-forest-labs/flux-1-schnell`);
assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)).sort(), ["prompt", "steps"]); assert.equal(S.files.size, 1); assert.equal(S.rows.length, 1);
ok("D1. image : Cloudflare enregistré, requête FLUX { prompt, steps }, image validée par les octets puis rangée dans le stockage privé");

resetAll(); handler = () => json({ result: { image: "" }, success: true }); r = await run(1); assert.equal(r.ok, false); assert.equal(S.files.size + S.rows.length, 0);
ok("D2. image vide : refusée, rien n'est stocké");

// E) voix : STT Whisper + TTS (binaire ou JSON base64), vérification par les octets
const voice = await import("@/lib/ai/providers/voice/cloudflare-voice.ts");
const CFG = { token: KEY, accountId: ACC };
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0x21, ...new Array(64).fill(1)]);
resetAll(); handler = () => json({ result: { text: "  Bonjour NOXIA  " }, success: true });
assert.equal(await voice.cloudflareTranscribe(CFG, new Uint8Array([1, 2, 3, 4])), "Bonjour NOXIA");
let vb = JSON.parse(calls[0].init.body);
assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/@cf/openai/whisper-large-v3-turbo`);
assert.deepEqual(vb, { audio: Buffer.from([1, 2, 3, 4]).toString("base64"), language: "fr" }); assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
ok("E1. STT : POST …/whisper-large-v3-turbo, corps { audio base64, language: fr }, texte nettoyé");

process.env.CLOUDFLARE_MODEL_TTS = "@cf/test-org/tts-model";
resetAll(); handler = () => new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } });
let sp = await voice.cloudflareSpeak(CFG, "Salut"); assert.equal(sp.mime, "audio/mpeg"); assert.equal(sp.bytes.byteLength, MP3.byteLength);
assert.deepEqual(JSON.parse(calls[0].init.body), { text: "Salut" });
ok("E2. TTS : réponse audio binaire acceptée, type confirmé par les octets");

resetAll(); handler = () => json({ result: { audio: Buffer.from(MP3).toString("base64") }, success: true });
sp = await voice.cloudflareSpeak(CFG, "Salut"); assert.equal(sp.mime, "audio/mpeg");
ok("E3. TTS : réponse JSON base64 acceptée");

resetAll(); handler = () => new Response(new TextEncoder().encode("<html>pas de l'audio</html>"), { status: 200, headers: { "content-type": "audio/mpeg" } });
assert.equal(await code(() => voice.cloudflareSpeak(CFG, "Salut")), "RESULT_INVALID");
resetAll(); handler = () => json({ success: false, result: null });
assert.equal(await code(() => voice.cloudflareSpeak(CFG, "Salut")), "PROVIDER_UNAVAILABLE");
resetAll(); handler = () => json({}, 429); assert.equal(await code(() => voice.cloudflareSpeak(CFG, "Salut")), "PROVIDER_RATE_LIMIT");
delete process.env.CLOUDFLARE_MODEL_TTS; resetAll(); assert.equal(await code(() => voice.cloudflareSpeak(CFG, "Salut")), "PROVIDER_MISCONFIGURED"); assert.equal(calls.length, 0);
ok("E4. TTS : contenu non audio refusé, success:false, 429 normalisé, modèle absent sans appel réseau");

// F) Pollinations : vidéo synchrone en octets, stockage privé, ASMR vidéo
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, ...new Array(80).fill(2)]); // « ftyp » aux octets 4-7
const { parseVideoResult } = await import("@/lib/ai/video/validate.ts");
Object.assign(process.env, { POLLINATIONS_API_KEY: "pol_TESTKEY_NOT_REAL_123456", POLLINATIONS_MODEL_VIDEO: "test-video", VIDEO_PROVIDER: "pollinations", ASMR_PROVIDER: "pollinations-video" });
const VREQ = { prompt: "Un lever de soleil sur la mer", style: "cinematic", durationSeconds: 5, format: "horizontal", quality: "standard", camera: "static", motion: "slow" };
const runVideo = () => executeProvider("video", (p, signal) => p.generate(VREQ, { signal, userId: UID, generationId: GID }), validateJobWith(v => parseVideoResult(v)), { generationId: GID });
resetAll(); handler = () => new Response(MP4, { status: 200, headers: { "content-type": "video/mp4" } });
r = await runVideo(); assert.equal(r.ok, true); assert.equal(r.providerId, "pollinations"); assert.equal(calls.length, 1);
const pu = new URL(calls[0].url); assert.equal(pu.origin, "https://gen.pollinations.ai"); assert.ok(pu.pathname.startsWith("/video/"));
assert.equal(pu.searchParams.get("model"), "test-video"); assert.equal(pu.searchParams.get("duration"), "5"); assert.equal(pu.searchParams.get("aspectRatio"), "16:9");
assert.equal(calls[0].init.headers.Authorization, "Bearer pol_TESTKEY_NOT_REAL_123456"); assert.ok(!calls[0].url.includes("pol_TESTKEY"), "la clé ne doit jamais être dans l'URL");
assert.equal(S.files.size, 1); assert.equal(S.rows.length, 1); assert.ok(!JSON.stringify(r.value).includes("pol_TESTKEY"));
ok("F1. vidéo : GET gen.pollinations.ai/video/<prompt>?model&duration&aspectRatio, Bearer en-tête (jamais dans l'URL), mp4 vérifié par les octets puis rangé en privé");

resetAll(); handler = () => new Response(new TextEncoder().encode("<html>erreur</html>"), { status: 200, headers: { "content-type": "video/mp4" } });
r = await runVideo(); assert.equal(r.ok, false); assert.equal(S.files.size + S.rows.length, 0);
resetAll(); handler = () => json({}, 402); r = await runVideo(); assert.equal(r.ok, false); assert.ok(!JSON.stringify(r.error).includes("pol_TESTKEY"));
ok("F2. contenu non vidéo refusé (rien de stocké) ; 402 normalisé sans secret");

const runAsmr = () => executeProvider("asmr", (p, signal) => p.generate({ type: "video", prompt: "Mains qui froissent du papier", style: "calm", ambiance: "studio", durationSeconds: 5, format: "vertical" }, { signal, userId: UID, generationId: GID }), v => v, { generationId: GID });
resetAll(); handler = () => new Response(MP4, { status: 200, headers: { "content-type": "video/mp4" } });
r = await runAsmr(); assert.equal(r.ok, true); assert.equal(r.providerId, "pollinations-video"); assert.equal(r.value.status, "completed"); assert.equal(r.value.result.asset.kind, "video"); assert.equal(S.files.size, 1);
ok("F3. ASMR vidéo : même moteur Pollinations, résultat de type vidéo stocké en privé");
delete process.env.POLLINATIONS_MODEL_VIDEO; resetAll(); r = await runVideo(); assert.equal(r.ok, false); assert.equal(calls.length, 0);
ok("F4. modèle absent : fournisseur indisponible, aucun appel réseau");

// G) pièces jointes : vision réellement transmise, contexte ZIP délimité, aucun mensonge si la vision n'est pas configurée
const IMG = { mimeType: "image/png", base64: Buffer.from(FX.PNG).toString("base64"), name: "capture.png" };
const sendWith = extra => executeProvider("agents", (p, signal) => {
  if (extra.images?.length && !p.supportsVision) throw Object.assign(new Error("no_vision"), { code: "PROVIDER_UNAVAILABLE" });
  return p.sendMessage({ agent: AGENT, conversation: [], message: "Explique cette erreur", context: { memory: "" }, ...extra }, { signal });
}, r => r, { generationId: GID });
process.env.AGENT_PROVIDER_FALLBACK = ""; process.env.CLOUDFLARE_MODEL_VISION = "@cf/test-org/vision-model";
resetAll(); handler = () => json({ result: { response: "Je vois une erreur 404." }, success: true });
r = await sendWith({ images: [IMG] }); assert.equal(r.ok, true); assert.equal(calls.length, 1);
assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/@cf/test-org/vision-model`, "modèle de VISION utilisé, pas le modèle texte");
const vm = JSON.parse(calls[0].init.body).messages.at(-1);
assert.equal(vm.content[0].type, "text"); assert.equal(vm.content[1].type, "image_url"); assert.equal(vm.content[1].image_url.url, `data:image/png;base64,${IMG.base64}`);
ok("G1. image : modèle de vision appelé, image réellement présente dans la requête (data URL base64), texte conservé");

delete process.env.CLOUDFLARE_MODEL_VISION; resetAll(); handler = () => json({ result: { response: "x" }, success: true });
r = await sendWith({ images: [IMG] }); assert.equal(r.ok, false); assert.equal(calls.length, 0, "aucun appel : pas d'« analyse » sans modèle de vision");
process.env.AGENT_PROVIDER_FALLBACK = "openrouter"; resetAll(); handler = url => url.startsWith("https://openrouter.ai") ? json({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }) : json({}, 500);
r = await sendWith({ images: [IMG] }); assert.equal(r.ok, false); assert.ok(!calls.some(c => c.url.startsWith("https://openrouter.ai")), "OpenRouter (texte seul) ne reçoit jamais une image");
process.env.AGENT_PROVIDER_FALLBACK = "";
ok("G2. vision non configurée : aucun appel ; le secours texte seul ne reçoit jamais l'image (jamais de fausse analyse)");

process.env.CLOUDFLARE_MODEL_VISION = ""; resetAll(); handler = () => json({ result: { response: "Projet Next.js." }, success: true });
r = await sendWith({ attachmentContext: "Archive ZIP : 3 entrée(s)\n=== package.json ===\n{}" }); assert.equal(r.ok, true);
const zb = JSON.parse(calls[0].init.body).messages; const zu = zb.at(-1).content, zs = zb[0].content;
assert.equal(calls[0].url, CF_URL, "le ZIP (texte) utilise le modèle texte"); assert.match(zu, /<noxia_pieces_jointes>[\s\S]*=== package\.json ===[\s\S]*<\/noxia_pieces_jointes>/);
assert.match(zs, /DONNÉES NON FIABLES/); assert.match(zs, /Ne prétends jamais avoir modifié un fichier/);
resetAll(); handler = () => json({ result: { response: "ok" }, success: true }); await sendWith({});
assert.ok(!JSON.parse(calls[0].init.body).messages[0].content.includes("PIÈCES JOINTES"), "sans pièce jointe, le prompt reste inchangé");
process.env.AGENT_PROVIDER_FALLBACK = "openrouter";
ok("G3. ZIP : résumé délimité envoyé au modèle texte avec l'avertissement « données non fiables » ; sans pièce, prompt inchangé");

// H) prompts anti-hallucination dans la requête réelle ; étapes et prompt d'image selon la qualité
process.env.AGENT_PROVIDER_FALLBACK = ""; process.env.CLOUDFLARE_MODEL_VISION = "";
resetAll(); handler = () => json({ result: { response: "ok" }, success: true }); await sendWith({});
const sysH = JSON.parse(calls[0].init.body).messages[0].content;
const iNN = sysH.indexOf("RÈGLES NON NÉGOCIABLES"), iAH = sysH.indexOf("HONNÊTETÉ ET EXACTITUDE"), iIns = sysH.indexOf("Instructions de l'utilisateur");
assert.ok(iNN >= 0 && iNN < iAH && iAH < iIns, "ordre : règles non négociables → anti-hallucination → instructions de l'utilisateur");
assert.match(sysH, /AUCUN accès à Internet/); assert.match(sysH, /N'invente JAMAIS/);
process.env.AGENT_PROVIDER_FALLBACK = "openrouter";
ok("H1. chaque requête texte porte les règles anti-hallucination, après les règles de sécurité et avant les instructions de l'agent");

for (const [quality, steps] of [["standard", 4], ["hd", 6], ["ultra", 8]]) {
  resetAll(); handler = () => json({ result: { image: Buffer.from(FX.PNG).toString("base64") }, success: true });
  const rq = await executeProvider("image", (p, signal) => p.generate({ prompt: "A portrait of a woman", style: "realistic", ratio: "1:1", quality, count: 1, format: "png" }, { signal, userId: UID, generationId: GID }), validateJobWith(v => parseImageResult(v, 1)), { generationId: GID });
  assert.equal(rq.ok, true); const b = JSON.parse(calls[0].init.body); assert.equal(b.steps, steps, quality); assert.match(b.prompt, /sharp focus/); assert.match(b.prompt, /five fingers/); assert.ok(b.prompt.length <= 2000);
}
ok("H2. image : étapes 4 / 6 / 8 selon standard / hd / ultra, prompt optimisé envoyé (qualité, mains), longueur bornée");

// I) facturation synchronisée avec la livraison : une image invalide n'est ni livrée, ni stockée (donc jamais débitée : le débit n'a lieu qu'à la finalisation d'un résultat validé)
resetAll(); handler = () => json({ result: { image: Buffer.from("pas une image du tout, simplement du texte brut").toString("base64") }, success: true });
const bad = await run(1); assert.equal(bad.ok, false); assert.equal(S.files.size + S.rows.length, 0);
ok("I1. image invalide : refusée avant stockage ; aucun résultat livré = aucune finalisation = aucun débit (voir test:generation-gateway)");

console.info = origInfo;
process.stdout.write(`\nCloudflare : ${n} groupes de contrôles OK\n`);
