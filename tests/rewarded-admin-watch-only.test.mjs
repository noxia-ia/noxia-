import fs from "node:fs";
import assert from "node:assert/strict";

const actions = fs.readFileSync("src/app/admin/campaigns/actions.ts", "utf8");
const panel = fs.readFileSync("src/components/NoxiaAdminCampaignPanel.tsx", "utf8");
assert.match(actions, /rewardCredits:\s*2/);
assert.match(actions, /p_reward_credits:\s*2/);
assert.match(actions, /p_required_action:\s*"visit"/);
assert.doesNotMatch(panel, /Action requise/);
assert.match(panel, /visionnage complet/);
console.log("rewarded-admin-watch-only: OK");
