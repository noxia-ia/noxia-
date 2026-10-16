import assert from 'node:assert/strict';
import { ttsCreditCost, sttCreditCost, generationCreditCost } from '../src/lib/generation-costs.ts';

assert.equal(generationCreditCost('image', { count: 1 }), 4);
assert.equal(generationCreditCost('video', { durationSeconds: 15 }), 32);
assert.equal(generationCreditCost('music', { durationSeconds: 60 }), 8);
assert.equal(generationCreditCost('asmr', { type: 'video', durationSeconds: 10 }), 25);
assert.equal(generationCreditCost('asmr', { type: 'audio' }), 5);
assert.equal(generationCreditCost('code'), 0);
assert.equal(generationCreditCost('agents'), 0);
assert.equal(ttsCreditCost('a'.repeat(1001)), 5);
assert.equal(sttCreditCost(31), 2);
console.log('generation-gateway economics: OK');
