import assert from 'node:assert/strict';
import fs from 'node:fs';
const component = fs.readFileSync('src/components/NoxiaRewardedCampaign.tsx', 'utf8');
const page = fs.readFileSync('src/app/dashboard/rewards/page.tsx', 'utf8');
assert.doesNotMatch(component, /setPhase\(["']action["']\)/);
assert.doesNotMatch(component, /J’ai effectué l’action|Effectuer l’action/);
assert.match(component, /visionnage complet requis/);
assert.match(page, /aucune action sociale supplémentaire n’est nécessaire/);
console.log('rewarded-ads UI policy: OK');
