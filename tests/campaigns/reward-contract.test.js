/**
 * NOXIA rewarded-campaign E2E rule tests.
 * These are deterministic integration-contract tests and do not call external
 * social providers. Production provider tests must use official sandbox/test
 * environments where available.
 */

function canReward({ watchCompleted, actionVerified, alreadyClaimed }) {
  return watchCompleted && actionVerified && !alreadyClaimed;
}

const cases = [
  ["both conditions true", {watchCompleted:true, actionVerified:true, alreadyClaimed:false}, true],
  ["watch incomplete", {watchCompleted:false, actionVerified:true, alreadyClaimed:false}, false],
  ["action unverified", {watchCompleted:true, actionVerified:false, alreadyClaimed:false}, false],
  ["duplicate claim", {watchCompleted:true, actionVerified:true, alreadyClaimed:true}, false],
];

for (const [name, input, expected] of cases) {
  const actual = canReward(input);
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
}

console.log("NOXIA campaign reward contract tests: PASS");
