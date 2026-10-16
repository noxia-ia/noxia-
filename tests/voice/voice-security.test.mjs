import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/0020_voice_hardening.sql", "utf8");
const stt = fs.readFileSync("src/app/api/voice/transcribe/route.ts", "utf8");
const tts = fs.readFileSync("src/app/api/voice/tts/route.ts", "utf8");

assert.match(sql, /reserve_voice_credit\(p_kind text, p_amount integer, p_daily_limit integer default 60\)/);
assert.match(sql, /finalize_voice_credit\(p_reservation_id uuid\)/);
assert.match(sql, /release_voice_credit\(p_reservation_id uuid\)/);
assert.match(sql, /voice_daily_limit/);
assert.match(sql, /interval '10 minutes'/);
assert.match(stt, /generationGateway\.reserveVoice/);
assert.match(stt, /generationGateway\.finalizeVoice|finalizeVoice/);
assert.match(stt, /generationGateway\.releaseVoice|releaseVoice/);
assert.match(tts, /generationGateway\.reserveVoice/);
assert.match(tts, /generationGateway\.finalizeVoice|finalizeVoice/);
assert.match(tts, /generationGateway\.releaseVoice|releaseVoice/);
assert.doesNotMatch(stt, /rpc\("consume_credits"/);
assert.doesNotMatch(tts, /rpc\("consume_credits"/);

console.log("voice-security tests: ok");

const voiceUi = fs.readFileSync("src/components/voice/NoxiaVoiceControls.tsx", "utf8");
assert.doesNotMatch(voiceUi, /SpeechRecognition/);
assert.doesNotMatch(voiceUi, /webkitSpeechRecognition/);
assert.match(voiceUi, /\/api\/voice\/transcribe/);
assert.match(voiceUi, /\/api\/voice\/tts/);
assert.match(voiceUi, /AUTO_MAX_CAPTURE_MS = 30_000/);
assert.match(stt, /sttPer30Seconds/);
console.log("voice-security fallback bypass: ok");
