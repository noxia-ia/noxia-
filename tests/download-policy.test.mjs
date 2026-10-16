import assert from 'node:assert/strict';
import { canDownloadWithoutFilingram } from '../src/lib/download-policy.ts';

assert.equal(canDownloadWithoutFilingram(null), false);
assert.equal(canDownloadWithoutFilingram({ plan: 'free', status: 'active', expires_at: null }), false);
assert.equal(canDownloadWithoutFilingram({ plan: 'pro', status: 'active', expires_at: null }), true);
assert.equal(canDownloadWithoutFilingram({ plan: 'ultra', status: 'active', expires_at: new Date(Date.now() - 1000).toISOString() }), false);
assert.equal(canDownloadWithoutFilingram({ plan: 'plus', status: 'suspended', expires_at: null }), false);
console.log('download-policy: OK');
