import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const gateway = await readFile(new URL('../src/lib/generation-gateway.ts', import.meta.url), 'utf8');
const generations = await readFile(new URL('../src/lib/generations.ts', import.meta.url), 'utf8');
assert.match(gateway, /generationCreditCost/);
assert.match(gateway, /input\.credits !== expected/);
assert.match(gateway, /INVALID_CREDIT_COST/);
assert.match(generations, /INVALID_CREDIT_COST/);
console.log('generation-gateway-cost-guard: OK');
