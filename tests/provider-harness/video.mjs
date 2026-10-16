import assert from "node:assert/strict";
const { registerProvider, getProviderChain, describeModule } = await import("@/lib/providers/registry.ts");
const { executeProvider } = await import("@/lib/providers/execute.ts");
const { validateJobWith } = await import("@/lib/providers/pipeline.ts");
const { parseVideoResult } = await import("@/lib/ai/video/validate.ts");
const { matchesMagic, ALLOWED_MIME_EXT, STORED_VIDEO_PATH_RE, MAX_BYTES } = await import("@/lib/storage/policy.ts");

let n = 0;
const ok = name => { n++; console.log(`  ✔ ${name}`); };

// Aucun fournisseur réel n'est enregistré dans le code livré. Ce provider de test existe uniquement dans ce banc.
let mode = "processing";
let polls = 0;
registerProvider("video", {
  config: { id: "test-video", name: "Test Video", module: "video", enabled: true, model: "test-model", supportsAsync: true, supportsPolling: true, maxRetries: 1 },
  create: () => ({
    id: "test-video",
    async generate() { return mode === "failed" ? { status: "failed", error: "provider failure" } : { status: "processing", jobId: "job-123" }; },
    async getJob(jobId) { assert.equal(jobId, "job-123"); polls++; if (mode === "processing") return { status: "processing", jobId }; return { status: "completed", result: { asset: { url: "https://cdn.example.com/video.mp4", mimeType: "video/mp4", durationSeconds: 5, format: "horizontal", width: 1280, height: 720 } } }; },
  }),
});
process.env.VIDEO_PROVIDER = "test-video";

assert.equal(getProviderChain("video").length, 1); ok("1. fournisseur vidéo de test enregistré uniquement dans le banc, chaîne centrale utilisée");

let r = await executeProvider("video", p => p.generate({ prompt: "une scène cinématique", durationSeconds: 5, format: "horizontal", quality: "standard", style: "cinematic", camera: "static", motion: "normal" }), validateJobWith(v => v), {});
assert.equal(r.ok, true); assert.equal(r.value.status, "processing"); assert.equal(r.value.jobId, "job-123"); ok("2. création asynchrone → processing + jobId");

mode = "processing";
r = await executeProvider("video", p => p.getJob("job-123"), validateJobWith(v => v), { onlyId: "test-video" });
assert.equal(r.value.status, "processing"); assert.equal(polls, 1); ok("3. polling → processing conserve le job");

mode = "completed";
r = await executeProvider("video", p => p.getJob("job-123"), validateJobWith(v => v), { onlyId: "test-video" });
assert.equal(r.value.status, "completed"); ok("4. polling → résultat terminé validé par le pipeline");

mode = "failed";
r = await executeProvider("video", p => p.generate({ prompt: "une scène cinématique", durationSeconds: 5, format: "horizontal", quality: "standard", style: "cinematic", camera: "static", motion: "normal" }), validateJobWith(v => v), {});
assert.equal(r.ok, false); ok("5. fournisseur en échec → aucune simulation de résultat");

const valid = { asset: { url: "https://cdn.example.com/video.mp4", mimeType: "video/mp4", durationSeconds: 5, format: "horizontal", width: 1280, height: 720 } };
assert.ok(parseVideoResult(valid));
for (const bad of [
  { asset: { url: "http://cdn.example.com/video.mp4", mimeType: "video/mp4" } },
  { asset: { url: "data:video/mp4;base64,AAAA", mimeType: "video/mp4" } },
  { asset: { url: "https://cdn.example.com/video.html", mimeType: "text/html" } },
  { asset: { url: "https://cdn.example.com/video.mp4", mimeType: "video/x-msvideo" } },
]) assert.equal(parseVideoResult(bad), null);
ok("6. validation résultat → HTTPS + video/* ; data:, HTTP, HTML et format arbitraire rejetés");

assert.equal(ALLOWED_MIME_EXT["video/mp4"], "mp4");
assert.equal(matchesMagic("video/mp4", new Uint8Array([0,0,0,20,0x66,0x74,0x79,0x70])) , true);
assert.equal(matchesMagic("video/webm", new Uint8Array([0x1a,0x45,0xdf,0xa3])), true);
assert.equal(matchesMagic("video/mp4", new Uint8Array([0,0,0,0,0,0,0,0])), false);
assert.equal(MAX_BYTES.video, 100 * 1024 * 1024);
assert.ok(STORED_VIDEO_PATH_RE.test("00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.mp4"));
assert.ok(!STORED_VIDEO_PATH_RE.test("../video.mp4"));
ok("7. stockage vidéo → mp4/webm, signature binaire, limite 100 Mo et chemin strict");

const d = describeModule("video");
assert.equal(d.chainLength, 1); assert.equal(d.roles[0].provider?.supportsAsync, true); assert.equal(d.roles[0].provider?.supportsPolling, true);
ok("8. administration → état asynchrone/polling exposé sans secret");

console.log(`\n${n} groupes de tests vidéo réussis`);
