import assert from 'node:assert/strict';
import { nextSeasonBatch, seasonProgress } from '../../src/lib/series-orchestrator.ts';

const eps = [
  { id:'e3', season_number:1, episode_number:3, status:'draft' },
  { id:'e1', season_number:1, episode_number:1, status:'completed' },
  { id:'e2', season_number:1, episode_number:2, status:'draft' },
  { id:'e4', season_number:1, episode_number:4, status:'draft' },
];
assert.deepEqual(nextSeasonBatch(eps, 3).map(e => e.id), ['e2','e3','e4']);
assert.deepEqual(nextSeasonBatch([{...eps[1], status:'processing'}, eps[0]], 3).map(e=>e.id), []);
assert.deepEqual(seasonProgress(eps), { total:4, completed:1, processing:0, failed:0, remaining:3 });
console.log('series-orchestrator: OK');
