import assert from "node:assert/strict";
globalThis.__falStub = { status: "IN_QUEUE", resultData: { video: { url: "https://v3.fal.media/files/test/video.mp4", content_type: "video/mp4", width: 1280, height: 720, duration: 5 } } };
const { FalVideo } = await import("@/lib/ai/providers/video/fal.ts");
const { ProviderError } = await import("@/lib/providers/errors.ts");
let n = 0;
const ok = name => { n++; console.log(`  ✔ ${name}`); };
const p = new FalVideo("test-key", "alibaba/wan-3.0/text-to-video");
const req = { prompt: "A cinematic city at night", durationSeconds: 5, format: "horizontal", quality: "standard", style: "cinematic", camera: "tracking", motion: "normal" };
let r = await p.generate(req);
assert.equal(r.status, "processing"); assert.equal(r.jobId, "fal-job-123");
assert.equal(globalThis.__falStub.lastEndpoint, "alibaba/wan-3.0/text-to-video");
assert.equal(globalThis.__falStub.lastInput.aspect_ratio, "16:9");
assert.equal(globalThis.__falStub.lastInput.resolution, "720p");
assert.equal(globalThis.__falStub.lastInput.duration, 5);
assert.equal(globalThis.__falStub.lastInput.audio, true);
ok("1. submit fal.ai → jobId + paramètres Wan 3.0");

r = await p.getJob("fal-job-123");
assert.equal(r.status, "processing");
ok("2. IN_QUEUE → processing");

globalThis.__falStub.status = "IN_PROGRESS";
r = await p.getJob("fal-job-123");
assert.equal(r.status, "processing");
ok("3. IN_PROGRESS → processing");

globalThis.__falStub.status = "COMPLETED";
r = await p.getJob("fal-job-123");
assert.equal(r.status, "completed");
assert.equal(r.result.asset.url, "https://v3.fal.media/files/test/video.mp4");
assert.equal(r.result.asset.mimeType, "video/mp4");
assert.equal(r.result.asset.width, 1280);
ok("4. COMPLETED → résultat vidéo validé");

globalThis.__falStub.status = "FAILED";
r = await p.getJob("fal-job-123");
assert.equal(r.status, "failed");
ok("5. FAILED → échec sans faux résultat");

globalThis.__falStub.status = "IN_QUEUE"; globalThis.__falStub.submitError = 429;
await assert.rejects(() => p.generate(req), e => e instanceof ProviderError && e.code === "PROVIDER_RATE_LIMIT");
delete globalThis.__falStub.submitError;
ok("6. 429 → erreur fournisseur normalisée");

await assert.rejects(() => p.getJob("bad id"), e => e instanceof ProviderError && e.code === "RESULT_INVALID");
ok("7. jobId invalide → RESULT_INVALID");
console.log(`\n${n} groupes de tests fal.ai réussis`);
