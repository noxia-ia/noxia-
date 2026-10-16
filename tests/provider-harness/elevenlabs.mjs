import assert from "node:assert/strict";
const { ElevenLabsASMR } = await import("@/lib/ai/providers/asmr/elevenlabs.ts");
const { ProviderError } = await import("@/lib/providers/errors.ts");
const { matchesMagic, STORED_AUDIO_PATH_RE, MAX_BYTES, ALLOWED_MIME_EXT } = await import("@/lib/storage/policy.ts");
let n = 0;
const ok = name => { n++; console.log(`  ✔ ${name}`); };

const mp3 = new Uint8Array([0x49,0x44,0x33,0x04,0x00,0x00,0x00,0x00]);
let calls = 0;
globalThis.fetch = async (url, init) => {
  calls++;
  assert.equal(String(url), "https://api.elevenlabs.io/v1/sound-generation");
  assert.equal(init.headers["xi-api-key"], "test-key");
  const body = JSON.parse(init.body);
  assert.equal(body.model_id, "eleven_text_to_sound_v2");
  assert.equal(body.duration_seconds, 5);
  return new Response(mp3, { status: 200, headers: { "content-type": "audio/mpeg", "content-length": String(mp3.byteLength) } });
};
const p = new ElevenLabsASMR("test-key", "eleven_text_to_sound_v2");
const req = { type: "audio", style: "satisfying", ambiance: "studio", durationSeconds: 5, format: "vertical", prompt: "couper une pomme croustillante" };
let r = await p.generate(req);
assert.equal(r.status, "completed");
assert.equal(r.result.asset.mimeType, "audio/mpeg");
assert.equal(r.result.asset.extension, "mp3");
assert.deepEqual([...r.result.asset.bytes], [...mp3]);
ok("1. ElevenLabs → génération audio simulée, octets MP3 et paramètres corrects");
assert.equal(calls, 1);

await assert.rejects(() => p.generate({ ...req, type: "video" }), e => e instanceof ProviderError && e.code === "INVALID_REQUEST");
ok("2. ElevenLabs → type vidéo refusé sans faux résultat");

const oldFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ error: "rate" }), { status: 429, headers: { "content-type": "application/json" } });
await assert.rejects(() => p.generate({ ...req, prompt: "sons de pluie" }), e => e instanceof ProviderError && e.code === "PROVIDER_RATE_LIMIT");
ok("3. 429 → erreur fournisseur normalisée");
globalThis.fetch = oldFetch;

assert.equal(ALLOWED_MIME_EXT["audio/mpeg"], "mp3");
assert.ok(matchesMagic("audio/mpeg", mp3));
assert.ok(STORED_AUDIO_PATH_RE.test("00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.mp3"));
assert.ok(!STORED_AUDIO_PATH_RE.test("../audio.mp3"));
assert.equal(MAX_BYTES.audio, 50 * 1024 * 1024);
ok("4. stockage audio → MP3, signature binaire, limite 50 Mo et chemin strict");
console.log(`\n${n} groupes de tests ElevenLabs réussis`);
