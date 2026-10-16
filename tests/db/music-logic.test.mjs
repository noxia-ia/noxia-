import assert from "node:assert/strict";
import { parseMusicParams, parseMusicForm, parseMusicResult } from "../../src/lib/ai/music/validate.ts";
import { musicCost } from "../../src/modules/music/config.ts";

assert.equal(musicCost(15), 1);
assert.equal(musicCost(16), 2);
assert.equal(musicCost(120), 8);

const params = parseMusicParams({ style: "cinematic", mood: "epic", durationSeconds: 30, format: "mp3", instrumental: true, bpm: 120, instruments: "piano" });
assert.ok(params);
assert.equal(params.style, "cinematic");
assert.equal(params.bpm, 120);
assert.equal(parseMusicParams({ ...params, bpm: 300 }), null);
assert.equal(parseMusicParams({ ...params, durationSeconds: 999 }), null);

const fd = new FormData();
fd.set("prompt", "Une musique cinématique épique pour une ouverture de film.");
fd.set("style", "cinematic"); fd.set("mood", "epic"); fd.set("duration", "30"); fd.set("format", "mp3"); fd.set("instrumental", "on");
assert.equal(parseMusicForm(fd).ok, true);

assert.ok(parseMusicResult({ asset: { url: "https://example.com/music.mp3", mimeType: "audio/mpeg", durationSeconds: 30 } }));
assert.equal(parseMusicResult({ asset: { url: "http://example.com/music.mp3", mimeType: "audio/mpeg" } }), null);
assert.equal(parseMusicResult({ asset: { url: "https://example.com/music.mp3", mimeType: "video/mp4" } }), null);
console.log("music logic: ok");
