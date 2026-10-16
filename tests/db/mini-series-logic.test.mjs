import assert from 'node:assert/strict';

const parsePlan = (raw, expected) => {
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || !Array.isArray(value.episodes) || value.episodes.length !== expected) return null;
  const rows = value.episodes.map((e) => {
    if (!e || typeof e !== 'object') return null;
    const title = typeof e.title === 'string' ? e.title.trim().slice(0, 160) : '';
    const synopsis = typeof e.synopsis === 'string' ? e.synopsis.trim().slice(0, 4000) : '';
    const continuity = typeof e.continuity_notes === 'string' ? e.continuity_notes.trim().slice(0, 6000) : '';
    return title && synopsis ? { title, synopsis, continuity } : null;
  });
  return rows.every(Boolean) ? rows : null;
};

const raw = JSON.stringify({ episodes: [
  { title: 'Le signal', synopsis: 'Un indice bouleverse les alliances.', continuity_notes: 'Le héros conserve son objectif.' },
  { title: 'La fracture', synopsis: 'Les conséquences du signal divisent le groupe.', continuity_notes: 'La fracture prépare le final.' },
] });
const plan = parsePlan(raw, 2);
assert.equal(plan?.length, 2);
assert.equal(parsePlan('{"episodes":[]}', 2), null);
assert.equal(parsePlan('not-json', 2), null);
assert.equal(parsePlan(JSON.stringify({ episodes: [{ title: 'ok', synopsis: '' }] }), 1), null);
console.log('mini-series logic: OK');
