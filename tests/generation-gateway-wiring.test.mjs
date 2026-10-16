import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'src/app/dashboard/image/actions.ts',
  'src/app/dashboard/video/actions.ts',
  'src/app/dashboard/music/actions.ts',
  'src/app/dashboard/asmr/actions.ts',
  'src/app/dashboard/code/actions.ts',
  'src/app/dashboard/series/actions.ts',
  'src/app/dashboard/agents/actions.ts',
];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /@\/lib\/generation-gateway/ , `${file} must use the central gateway`);
  assert.doesNotMatch(source, /\bcreateGeneration\s*\(/, `${file} bypasses the central generation gateway`);
  if (file.endsWith('/agents/actions.ts')) {
    assert.doesNotMatch(source, /\baddPendingAssistant\s*\(/, `${file} bypasses the central agent gateway`);
  }
}
for (const file of ['src/app/api/voice/tts/route.ts','src/app/api/voice/transcribe/route.ts']) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /generationGateway\.reserveVoice/);
  assert.doesNotMatch(source, /\.rpc\("reserve_voice_credit"/);
}
console.log('generation-gateway wiring: OK');
