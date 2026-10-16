// Banc de test DRACULA IMAGE (étape 14) : exécute le VRAI code du projet (fournisseur Hugging Face, validation des octets, stockage, registre, pipeline)
// avec un FAUX fetch et un FAUX client Supabase. Aucun réseau, aucune vraie clé : ce banc ne prouve PAS que Hugging Face répond (voir docs/PROVIDERS.md §9).
// Lancer : npm run test:providers   (Node >= 22.7). Les images sont de vraies images (fixtures.mjs, produites par un encodeur).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as FX from "./fixtures.mjs";

const KEY = "hf_TESTKEY_NOT_A_REAL_SECRET_123456", SVC = "SERVICEKEY_NOT_REAL_987654";
const UID = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", GID = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
Object.assign(process.env, { HF_API_KEY: KEY, HF_MODEL_IMAGE: "test-org/test-model", IMAGE_PROVIDER: "huggingface", STORAGE_PROVIDER: "supabase-storage", NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SECRET_KEY: SVC });
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
const { executeProvider, withTimeout } = await import("@/lib/providers/execute.ts");
const { checkProviderHealth } = await import("@/lib/providers/health.ts");
const { preflight, settleJob, validateJobWith } = await import("@/lib/providers/pipeline.ts");
const { inspectImageBytes, assertDeclaredMime } = await import("@/lib/ai/image/bytes.ts");
const { parseImageResult } = await import("@/lib/ai/image/validate.ts");
const { USER_MESSAGES } = await import("@/lib/providers/errors.ts");
const { STORED_IMAGE_PATH_RE } = await import("@/lib/storage/policy.ts");
const { persistBytes } = await import("@/lib/storage/index.ts");
const { SupabaseStorage } = await import("@/lib/storage/supabase-storage.ts");
const { RATIO_SIZES } = await import("@/lib/ai/providers/image/huggingface.ts");

let n = 0; const ok = name => { n++; process.stdout.write(`  ✔ ${name}\n`); };
const PROMPT = "A cinematic landscape of a tropical city at sunset, realistic photography style";
const REQ = (count = 1, o = {}) => ({ prompt: PROMPT, style: "cinematic", ratio: "16:9", quality: "hd", count, format: "png", ...o });
const run = (count = 1) => executeProvider("image", (p, signal) => p.generate(REQ(count), { signal, userId: UID, generationId: GID }), validateJobWith(v => parseImageResult(v, count)), { generationId: GID });
const code = async fn => { try { await fn(); } catch (e) { return e.code ?? `NON_NORMALISÉ:${e.message}`; } return null; };
const mut = (b, f) => { const c = new Uint8Array(b); f(c); return c; };
const u32 = (c, i, v) => { c[i] = (v >>> 24) & 255; c[i + 1] = (v >>> 16) & 255; c[i + 2] = (v >>> 8) & 255; c[i + 3] = v & 255; };
const noStored = () => assert.equal(S.files.size + S.rows.length, 0, "rien ne doit être stocké");

// A) images valides : PNG, JPEG, WebP (VP8, VP8L, VP8X)
for (const [name, bytes, mime, ext] of [["PNG", FX.PNG, "image/png", "png"], ["JPEG", FX.JPEG, "image/jpeg", "jpg"], ["WebP lossy (VP8)", FX.WEBP_LOSSY, "image/webp", "webp"], ["WebP lossless (VP8L)", FX.WEBP_LOSSLESS, "image/webp", "webp"], ["WebP étendu (VP8X)", FX.WEBP_ALPHA, "image/webp", "webp"]]) {
  const r = inspectImageBytes(bytes); assert.deepEqual([r.mime, r.ext, r.width, r.height], [mime, ext, 64, 48], name);
}
ok("A1. PNG, JPEG, WebP (VP8, VP8L, VP8X) réels : type détecté par les octets, dimensions réelles lues (64×48)");

// B) flux complet réussi + forme exacte de la requête + stockage
resetAll(); handler = () => img(FX.PNG);
let r = await run(1);
assert.equal(r.ok, true); assert.equal(r.providerId, "huggingface"); assert.equal(calls.length, 1);
const c0 = calls[0], body = JSON.parse(c0.init.body);
assert.equal(c0.url, "https://router.huggingface.co/hf-inference/models/test-org/test-model"); assert.equal(c0.init.method, "POST");
assert.equal(c0.init.headers.Authorization, `Bearer ${KEY}`); assert.equal(c0.init.redirect, "error");
assert.match(c0.init.headers.Accept, /image\/png/); assert.equal(c0.init.headers["Content-Type"], "application/json");
assert.deepEqual(Object.keys(body).sort(), ["inputs", "parameters"]); assert.ok(body.inputs.startsWith(PROMPT)); assert.deepEqual(body.parameters, { width: 1344, height: 768 });
assert.ok(!JSON.stringify(body).includes(KEY), "la clé ne doit pas être dans le corps");
ok("B1. requête : POST https://router.huggingface.co/hf-inference/models/<modèle>, Bearer dans l'en-tête seulement, corps { inputs, parameters{width,height} }, aucune redirection suivie");
assert.equal(S.files.size, 1); const [[fp, f]] = [...S.files];
assert.match(fp, STORED_IMAGE_PATH_RE); assert.ok(fp.startsWith(`${UID}/${GID}/`)); assert.equal(f.bucket, "dracula-images"); assert.equal(f.opts.contentType, "image/png"); assert.equal(f.opts.upsert, false);
assert.deepEqual([...f.bytes], [...FX.PNG]);
assert.equal(S.rows.length, 1); const row = S.rows[0];
assert.deepEqual([row.user_id, row.generation_id, row.storage_provider, row.path, row.mime_type, row.bytes], [UID, GID, "supabase-storage", fp, "image/png", FX.PNG.length]);
const asset = r.value.result.images[0];
assert.equal(asset.storedUrl, `https://proj.supabase.co/storage/v1/object/public/dracula-images/${fp}`); assert.equal(asset.url, asset.storedUrl);
assert.deepEqual([asset.mimeType, asset.width, asset.height], ["image/png", 64, 48]); assert.ok(!JSON.stringify(r.value).includes("data:"), "aucune data: URL");
assert.ok(parseImageResult(r.value.result, 1), "le résultat passe parseImageResult (URL HTTPS)");
ok("B2. stockage : bucket dracula-images, chemin <userId>/<generationId>/<uuid>.png, upsert interdit, octets identiques, ligne stored_assets, storedUrl HTTPS, dimensions RÉELLES, aucune data: URL");
for (const [bytes, mime] of [[FX.JPEG, "image/jpeg"], [FX.WEBP_LOSSY, "image/webp"]]) { resetAll(); handler = () => img(bytes, mime); r = await run(1); assert.equal(r.ok, true); assert.equal(r.value.result.images[0].mimeType, mime); }
resetAll(); handler = () => img(FX.PNG, "application/octet-stream"); r = await run(1); assert.equal(r.ok, true);
ok("B3. JPEG et WebP valides stockés avec leur vrai type ; octet-stream accepté seulement parce que les octets sont valides");

// C) contenus invalides : jamais stockés, RESULT_INVALID, un seul appel (pas de réessai chez le même fournisseur), aucun détail
const png0 = (w, h) => mut(FX.PNG, c => { u32(c, 16, w); u32(c, 20, h); });
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = new TextEncoder().encode("<!DOCTYPE html><html><body>erreur</body></html>");
const bads = {
  "SVG (étiqueté image/png)": [SVG, "image/png"], "SVG (étiqueté image/svg+xml)": [SVG, "image/svg+xml"], "HTML (étiqueté image/png)": [HTML, "image/png"], "HTML (text/html)": [HTML, "text/html"],
  "JSON d'erreur en HTTP 200": [new TextEncoder().encode('{"error":"model loading"}'), "application/json"], "GIF": [new TextEncoder().encode("GIF89a\x01\x00\x01\x00"), "image/gif"],
  "octets aléatoires": [Uint8Array.from({ length: 300 }, (_, i) => (i * 37 + 11) & 255), "image/png"], "corps vide": [new Uint8Array(0), "image/png"],
  "PNG tronqué": [FX.PNG.slice(0, FX.PNG.length - 20), "image/png"], "JPEG tronqué": [FX.JPEG.slice(0, FX.JPEG.length - 120), "image/jpeg"], "WebP tronqué": [FX.WEBP_LOSSY.slice(0, FX.WEBP_LOSSY.length - 40), "image/webp"],
  "PNG 0×0": [png0(0, 0), "image/png"], "PNG 9000×100 (> 8192)": [png0(9000, 100), "image/png"], "PNG 8000×8000 (> 40 Mpx)": [png0(8000, 8000), "image/png"],
  "MIME falsifié : JPEG annoncé PNG": [FX.JPEG, "image/png"], "MIME falsifié : PNG annoncé WebP": [FX.PNG, "image/webp"], "PNG valide annoncé text/html": [FX.PNG, "text/html"], "PNG valide annoncé SVG": [FX.PNG, "image/svg+xml"],
};
for (const [name, [bytes, type]] of Object.entries(bads)) { resetAll(); handler = () => img(bytes, type); r = await run(1); assert.equal(r.ok, false, name); assert.equal(r.error.code, "RESULT_INVALID", name); assert.equal(calls.length, 1, name); noStored(); assert.equal(r.error.message, USER_MESSAGES.RESULT_INVALID); }
ok(`C1. ${Object.keys(bads).length} réponses invalides rejetées (SVG, HTML, JSON, GIF, aléatoire, vide, tronquées, dimensions, MIME falsifiés) : RESULT_INVALID, un seul appel, RIEN de stocké`);
// taille excessive : annoncée (Content-Length) ET réelle (flux sans Content-Length)
resetAll(); handler = () => img(FX.PNG, "image/png", { "content-length": String(16 * 1024 * 1024) }); r = await run(1); assert.equal(r.error.code, "RESULT_INVALID"); noStored();
resetAll(); let sent = 0; handler = () => new Response(new ReadableStream({ pull(c) { if (sent >= 40) return c.close(); sent++; c.enqueue(new Uint8Array(1024 * 1024)); } }), { status: 200, headers: { "content-type": "image/png" } });
r = await run(1); assert.equal(r.error.code, "RESULT_INVALID"); assert.ok(sent < 40, "la lecture s'arrête dès la limite dépassée"); noStored();
assert.equal(await code(() => { inspectImageBytes(new Uint8Array(15 * 1024 * 1024 + 1)); }), "RESULT_INVALID");
ok("C2. taille excessive (15 Mo) rejetée : Content-Length annoncé, flux réel interrompu dès la limite, et contrôle direct des octets");
assert.equal(await code(() => assertDeclaredMime("image/jpg", "image/jpeg")), null); assert.equal(await code(() => assertDeclaredMime("image/png; charset=binary", "image/png")), null);
ok("C3. alias image/jpg et paramètres de Content-Type tolérés ; tout le reste qui contredit les octets est refusé");

// D) erreurs HTTP : normalisées, corps jamais relayé, réessais selon la politique existante
const expectations = [[401, "PROVIDER_MISCONFIGURED", 1], [402, "PROVIDER_MISCONFIGURED", 1], [403, "PROVIDER_MISCONFIGURED", 1], [400, "INVALID_REQUEST", 1], [404, "INVALID_REQUEST", 1], [429, "PROVIDER_RATE_LIMIT", 2], [500, "PROVIDER_UNAVAILABLE", 2], [503, "PROVIDER_UNAVAILABLE", 2], [504, "PROVIDER_TIMEOUT", 2]];
for (const [st, c, expectedCalls] of expectations) {
  resetAll(); handler = () => status(st); r = await run(1);
  assert.equal(r.ok, false, String(st)); assert.equal(r.error.code, c, String(st)); assert.equal(calls.length, expectedCalls, `${st} : appels`); noStored();
  assert.equal(r.error.message, USER_MESSAGES[c]); assert.ok(!JSON.stringify(r).includes("SECRET_DETAIL") && !JSON.stringify(r).includes(KEY) && !JSON.stringify(r).includes("hf_"), "corps d'erreur / clé jamais relayés");
}
ok("D1. 401, 402, 403 → configuration (1 appel) ; 400, 404 → requête invalide (1 appel) ; 429, 500, 503, 504 → temporaire (1 réessai) ; message utilisateur sans détail, sans clé, rien de stocké");

// E) timeout réel : requête annulée, y compris pendant la lecture du corps
resetAll(); let aborted = false;
handler = (u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => { aborted = true; const e = new Error("aborted"); e.name = "AbortError"; rej(e); }));
const t0 = Date.now(); const prov = registry.getProviderChain("image")[0].provider;
assert.equal(await code(() => withTimeout(60, s => prov.generate(REQ(), { signal: s, userId: UID, generationId: GID }))), "PROVIDER_TIMEOUT"); assert.ok(aborted && Date.now() - t0 < 1000); noStored();
resetAll(); aborted = false;
handler = (u, init) => new Response(new ReadableStream({ start(c) { c.enqueue(FX.PNG.slice(0, 50)); init.signal.addEventListener("abort", () => { aborted = true; const e = new Error("aborted"); e.name = "AbortError"; c.error(e); }); } }), { status: 200, headers: { "content-type": "image/png" } });
assert.equal(await code(() => withTimeout(80, s => prov.generate(REQ(), { signal: s, userId: UID, generationId: GID }))), "PROVIDER_TIMEOUT"); assert.ok(aborted); noStored();
ok("E1. timeout : requête réellement annulée (avant la réponse ET pendant la lecture du corps), PROVIDER_TIMEOUT, rien de stocké");
resetAll(); handler = () => img(FX.PNG);
assert.equal(await code(async () => { const ac = new AbortController(); const p = prov.generate(REQ(), { signal: ac.signal, userId: UID, generationId: GID }); ac.abort(); await p; }) !== null, true); noStored();
ok("E2. annulation avant le rangement : aucun fichier stocké après l'abandon");

// F) plusieurs images, échecs partiels, nettoyage
resetAll(); handler = () => img(FX.PNG); r = await run(2);
assert.equal(r.ok, true); assert.equal(calls.length, 2); assert.equal(S.files.size, 2); assert.equal(S.rows.length, 2); assert.equal(r.value.result.images.length, 2);
assert.equal(new Set(r.value.result.images.map(i => i.storedUrl)).size, 2, "chemins distincts");
resetAll(); handler = () => img(FX.PNG); r = await run(4); assert.equal(r.value.result.images.length, 4); assert.equal(S.files.size, 4);
ok("F1. 2 et 4 images : autant d'appels et de fichiers, chemins distincts (UUID), toutes suivies dans stored_assets");
resetAll(); let k = 0; handler = () => (++k === 2 ? status(500) : img(FX.PNG)); r = await run(2);
assert.equal(r.ok, true, "le réessai relance TOUT le lot chez le fournisseur : 2e passe valide"); // 1re passe : image 2 en 500 → rien stocké → réessai → succès
assert.equal(S.files.size, 2);
resetAll(); handler = (u, i) => status(500); r = await run(2); assert.equal(r.ok, false); noStored();
resetAll(); handler = () => img(FX.PNG); S.failUploadAt = 2; r = await run(2);
assert.equal(r.ok, false); assert.equal(r.error.code, "GENERATION_FAILED"); assert.equal(calls.length, 2, "panne de NOTRE stockage : pas de réessai (pas de second appel payant)");
assert.equal(S.uploads, 2, "le 1er fichier avait bien été envoyé…"); noStored(); // …puis retiré (fichier ET ligne de suivi) : aucun orphelin
resetAll(); handler = () => img(FX.PNG); S.failUploadAt = 1; let r2 = await run(1); assert.equal(r2.ok, false); assert.equal(r2.error.code, "GENERATION_FAILED"); assert.equal(calls.length, 1, "panne de NOTRE stockage : pas de second appel payant"); noStored();
resetAll(); handler = () => img(FX.PNG); S.failInsert = true; r2 = await run(1); assert.equal(r2.ok, false); noStored();
ok("F2. échec partiel : rien n'est stocké tant qu'une image est invalide ; échec de rangement → fichiers déjà rangés retirés ; panne du stockage → GENERATION_FAILED sans second appel fournisseur ; suivi impossible → fichier retiré");

// G) garde-fous du stockage (défense en profondeur, indépendants du fournisseur)
resetAll();
for (const bad of [{ mime: "image/png", ext: "jpg", bytes: FX.PNG }, { mime: "image/png", ext: "png", bytes: FX.JPEG }, { mime: "image/svg+xml", ext: "svg", bytes: SVG }, { mime: "image/png", ext: "png", bytes: new Uint8Array(0) }, { mime: "video/mp4", ext: "mp4", bytes: FX.PNG }])
  assert.ok(await code(() => persistBytes({ userId: UID, generationId: GID, ...bad })) !== null, JSON.stringify([bad.mime, bad.ext]));
noStored();
const st = new SupabaseStorage();
for (const p of ["../x.png", `${UID}/${GID}/../../a.png`, `${UID}/${GID}/x.png`, `${UID}/${GID}/${UID}.svg`, "/etc/passwd", `${UID}/${GID}/${UID}.png/extra`]) assert.ok(await code(() => st.put({ path: p, bytes: FX.PNG, mimeType: "image/png" })) !== null && await code(() => st.remove(p)) !== null, p);
assert.ok(await code(() => st.put({ path: `${UID}/${GID}/${UID}.png`, bytes: FX.PNG, mimeType: "image/svg+xml" })) !== null); assert.ok(await code(() => st.put({ path: `${UID}/${GID}/${UID}.png`, bytes: new Uint8Array(15 * 1024 * 1024 + 1), mimeType: "image/png" })) !== null); noStored();
ok("G1. stockage : type/extension/signature incohérents, SVG, vide, vidéo, chemins hors forme (.., absolu, sous-dossier), fichier > 15 Mo → refusés avant tout envoi");

// H) disponibilité : clé, modèle, stockage absents ou invalides → aucun appel
const chainSize = () => registry.getProviderChain("image").length;
resetAll(); handler = () => img(FX.PNG);
delete process.env.HF_API_KEY; assert.equal(chainSize(), 0); r = await run(1); assert.equal(r.error.code, "NO_PROVIDER"); assert.equal(calls.length, 0); assert.equal(await checkProviderHealth("image", "huggingface"), "not_configured"); process.env.HF_API_KEY = KEY;
delete process.env.HF_MODEL_IMAGE; assert.equal(chainSize(), 0); r = await run(1); assert.equal(r.error.code, "NO_PROVIDER"); assert.equal(calls.length, 0); process.env.HF_MODEL_IMAGE = "test-org/test-model";
delete process.env.STORAGE_PROVIDER; assert.equal(chainSize(), 0); r = await run(1); assert.equal(r.error.code, "NO_PROVIDER"); assert.equal(calls.length, 0);
let d = registry.describeModule("image").roles[0].provider; assert.deepEqual([d.storageRequired, d.storageReady, d.complete], [true, false, false]);
process.env.STORAGE_PROVIDER = "inconnu"; assert.equal(chainSize(), 0); process.env.STORAGE_PROVIDER = "supabase-storage";
assert.equal(chainSize(), 1);
ok("H1. clé absente, modèle absent, stockage absent ou inconnu → fournisseur indisponible, NO_PROVIDER, health « not_configured », AUCUN appel réseau");
for (const bad of ["../../evil", "a/b/c", "x y", "a/..", ""]) { process.env.HF_MODEL_IMAGE = bad; resetAll(); handler = () => img(FX.PNG); r = await run(1); assert.ok(r.ok === false && calls.length === 0 && S.files.size === 0, bad); }
process.env.HF_MODEL_IMAGE = "test-org/test-model";
resetAll(); handler = () => img(FX.PNG); assert.equal(await code(() => prov.generate(REQ(), {})), "PROVIDER_MISCONFIGURED"); assert.equal(calls.length, 0);
ok("H2. nom de modèle invalide (chemin, espaces, segments en trop) ou contexte serveur absent → refus, aucun appel");

// I) santé : GET whoami, sans corps, sans prompt, sans génération ; administration sans secret
resetAll(); handler = u => { assert.equal(u, "https://huggingface.co/api/whoami-v2"); return new Response(JSON.stringify({ name: "x" }), { status: 200, headers: { "content-type": "application/json" } }); };
assert.equal(await checkProviderHealth("image", "huggingface"), "ok"); assert.equal(calls.length, 1); assert.equal(calls[0].init.method, "GET"); assert.equal(calls[0].init.body, undefined); assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`); assert.equal(S.files.size + S.rpc.length, 0);
for (const [st, exp] of [[401, "error"], [403, "error"], [429, "temporary_error"], [503, "temporary_error"]]) { resetAll(); handler = () => status(st); assert.equal(await checkProviderHealth("image", "huggingface"), exp, String(st)); }
resetAll(); handler = () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }); assert.equal(await checkProviderHealth("image", "huggingface"), "ok");
ok("I1. health : GET whoami-v2 sans corps ni prompt, ni génération, ni crédit ; 401/403 → Indisponible ; 429/503 → Erreur temporaire");
const dump = JSON.stringify(registry.describeModule("image"));
assert.ok(!dump.includes(KEY) && !dump.includes(SVC)); d = registry.describeModule("image").roles[0].provider;
assert.deepEqual([d.id, d.name, d.model, d.keyPresent, d.keyEnvName, d.modelEnvName, d.complete, d.storageRequired, d.storageReady, d.healthCheckAvailable], ["huggingface", "Hugging Face", "test-org/test-model", true, "HF_API_KEY", "HF_MODEL_IMAGE", true, true, true, true]);
ok("I2. administration : Hugging Face / IMAGE, modèle, « clé présente » (booléen) et NOM de variable seulement ; la clé n'apparaît nulle part dans la description");

// J) pipeline : modération, crédits, finalisation
const sb = globalThis.__fakeSupabase;
resetAll(); handler = () => img(FX.PNG);
let pf = await preflight("image", { supabase: sb, userId: UID, prompt: "image nue d'une mineure de 14 ans", params: REQ(), cost: 1 });
assert.deepEqual([pf.ok, pf.code], [false, "CONTENT_BLOCKED"]); assert.equal(calls.length, 0);
S.credits = 0; pf = await preflight("image", { supabase: sb, userId: UID, prompt: "image nue d'une mineure de 14 ans", params: REQ(), cost: 1 }); assert.equal(pf.code, "CONTENT_BLOCKED", "la modération passe AVANT les crédits"); assert.equal(calls.length, 0);
pf = await preflight("image", { supabase: sb, userId: UID, prompt: PROMPT, params: REQ(), cost: 1 }); assert.deepEqual([pf.ok, pf.code, pf.kind], [false, "INSUFFICIENT_CREDITS", "insufficient_credits"]); assert.equal(calls.length, 0); assert.equal(S.files.size, 0);
S.credits = 5; pf = await preflight("image", { supabase: sb, userId: UID, prompt: PROMPT, params: REQ(), cost: 1 }); assert.equal(pf.ok, true); assert.equal(calls.length, 0, "le préflight n'appelle jamais le fournisseur");
delete process.env.STORAGE_PROVIDER; pf = await preflight("image", { supabase: sb, userId: UID, prompt: PROMPT, params: REQ(), cost: 1 }); assert.equal(pf.code, "NO_PROVIDER"); process.env.STORAGE_PROVIDER = "supabase-storage";
ok("J1. prompt bloqué → CONTENT_BLOCKED avant crédits et avant fournisseur ; crédits insuffisants → aucun appel Hugging Face ; stockage absent → NO_PROVIDER ; le préflight n'appelle jamais le fournisseur");
resetAll(); handler = () => img(FX.PNG); r = await run(2);
let s = await settleJob({ id: GID, providerId: "huggingface", job: r.value, cost: 2 });
assert.equal(s.state, "done"); const fin = S.rpc.find(x => x.name === "finalize_generation"); assert.equal(fin.args.p_status, "completed"); assert.equal(fin.args.p_credits, 2); assert.equal(fin.args.p_provider, "huggingface"); assert.equal(fin.args.p_result.images.length, 2); assert.ok(fin.args.p_result.images.every(i => /^https:\/\//.test(i.storedUrl)));
S.rpc = []; S.rpcImpl = () => ({ error: { message: "already_finalized" } }); s = await settleJob({ id: GID, providerId: "huggingface", job: r.value, cost: 2 }); assert.equal(s.state, "already_done"); assert.ok(S.rpc.every(x => x.args.p_status !== "failed"), "une double finalisation n'écrit pas un échec");
S.rpc = []; S.rpcImpl = (name, a) => (a.p_status === "completed" ? { error: { message: "insufficient_credits" } } : { error: null }); s = await settleJob({ id: GID, providerId: "huggingface", job: r.value, cost: 2 });
assert.deepEqual([s.state, s.code], ["failed", "INSUFFICIENT_CREDITS"]); assert.equal(S.rpc.at(-1).args.p_status, "failed"); assert.ok(!S.rpc.at(-1).args.p_credits, "un échec ne transmet aucun montant à débiter");
ok("J2. finalisation : débit demandé = coût serveur, une fois, avec le résultat validé ; already_finalized → « déjà terminé » sans échec ni débit ; solde épuisé → échec sans débit (le SQL atomique est testé séparément)");

// K) journaux et analyse statique (secrets, NEXT_PUBLIC, process.env côté client, data: URL)
const logDump = logs.join("\n"); assert.ok(!logDump.includes(KEY) && !logDump.includes(SVC) && !logDump.includes("tropical") && !logDump.includes("SECRET_DETAIL") && logs.length > 10);
ok(`K1. ${logs.length} lignes de journal inspectées : ni la clé, ni la clé serveur Supabase, ni le prompt, ni un corps d'erreur`);
const ROOT = path.resolve(import.meta.dirname, "../.."); const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === ".next") continue; const p = path.join(dir, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "supabase")), ...walk(path.join(ROOT, "docs")), path.join(ROOT, ".env.example")];
const text = f => fs.readFileSync(f, "utf8");
assert.deepEqual(files.filter(f => /NEXT_PUBLIC_(HF|HUGGING|OPENROUTER)/.test(text(f))), [], "aucune variable NEXT_PUBLIC_ sensible");
assert.deepEqual(files.filter(f => /\bhf_[A-Za-z0-9]{20,}/.test(text(f))), [], "aucun jeton Hugging Face en dur");
assert.deepEqual(files.filter(f => f.includes(`${path.sep}src${path.sep}`) && /^["']use client["']/.test(text(f).trimStart()) && /process\.env/.test(text(f))), [], "aucun process.env dans un composant client");
assert.deepEqual(files.filter(f => f.includes(`${path.sep}src${path.sep}`) && text(f).includes("HF_API_KEY")).map(f => path.relative(ROOT, f).replaceAll("\\", "/")), ["src/lib/providers/register.ts"], "le NOM HF_API_KEY n'apparaît que dans register.ts (jamais sa valeur)");
for (const f of ["src/lib/ai/providers/image/huggingface.ts", "src/lib/storage/index.ts", "src/lib/storage/supabase-storage.ts", "src/lib/ai/image/bytes.ts"]) assert.ok(!/data:(image|application)|btoa\(|toString\("base64"\)/.test(text(path.join(ROOT, f))), `${f} : pas de data: URL`);
assert.ok(text(path.join(ROOT, "src/app/dashboard/image/actions.ts")).includes("Math.min(cost, IMAGE_CREDIT_COST *"), "coût plafonné aux images validées");
assert.ok(text(path.join(ROOT, "src/app/dashboard/image/actions.ts")).includes("userId: user.id, generationId: id"), "identifiants serveur transmis au fournisseur");
assert.ok(!/body\.cost|formData\.get\(["']cost/.test(text(path.join(ROOT, "src/app/dashboard/image/actions.ts"))), "le coût n'est jamais lu du navigateur");
ok("K2. analyse statique : aucune NEXT_PUBLIC_ sensible, aucun jeton en dur, aucun process.env côté client, HF_API_KEY nommée seulement dans register.ts, aucune data: URL, coût jamais lu du navigateur");

console.info = origInfo; console.log(`\n${n} groupes de tests IMAGE réussis`);
