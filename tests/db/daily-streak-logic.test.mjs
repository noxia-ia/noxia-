import assert from "node:assert/strict";
import { DAILY_REWARDS, rewardForDay, nextClaimDay, canClaimDailyCredit } from "../../src/lib/daily-streak.ts";

assert.deepEqual([...DAILY_REWARDS], [1, 1, 1, 2, 2, 3, 5]);
assert.equal(nextClaimDay(null, new Date("2026-10-10T08:10:20Z")), 1, "nouvel utilisateur -> J1");
assert.equal(canClaimDailyCredit(null, new Date("2026-10-10T08:10:20Z")), true);

const t0 = new Date("2026-10-10T08:10:20Z");
assert.equal(canClaimDailyCredit(t0.toISOString(), new Date("2026-10-11T08:10:19Z")), false, "avant 24h -> bloqué");
assert.equal(canClaimDailyCredit(t0.toISOString(), new Date("2026-10-11T08:10:20Z")), true, "à 24h exactes -> disponible");
assert.equal(nextClaimDay({ streakDay: 1, lastClaimAt: t0.toISOString() }, new Date("2026-10-11T08:10:20Z")), 2);
assert.equal(nextClaimDay({ streakDay: 6, lastClaimAt: t0.toISOString() }, new Date("2026-10-11T08:10:20Z")), 7);
assert.equal(nextClaimDay({ streakDay: 7, lastClaimAt: t0.toISOString() }, new Date("2026-10-11T08:10:20Z")), 1, "J7 -> J1");
assert.equal(nextClaimDay({ streakDay: 2, lastClaimAt: t0.toISOString() }, new Date("2026-10-12T08:10:19Z")), 3, "moins de 48h -> streak conservé");
assert.equal(nextClaimDay({ streakDay: 2, lastClaimAt: t0.toISOString() }, new Date("2026-10-12T08:10:20Z")), 1, "48h exactes -> journée manquée -> reset");
assert.equal(nextClaimDay({ streakDay: 7, lastClaimAt: t0.toISOString() }, new Date("2026-10-12T09:00:00Z")), 1, "plus de 48h -> reset");
assert.equal(rewardForDay(7), 5);
assert.equal(rewardForDay(8), 1);
assert.equal(rewardForDay(14), 5);
console.log("daily-streak tests: ok");
