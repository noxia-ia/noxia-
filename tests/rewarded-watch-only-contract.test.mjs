import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('supabase/migrations/0041_rewarded_ads_watch_only.sql', 'utf8');
const analytics = fs.readFileSync('supabase/migrations/0044_rewarded_ads_watch_only_analytics.sql', 'utf8');
const watch = fs.readFileSync('src/lib/campaigns/watch.ts', 'utf8');
const component = fs.readFileSync('src/components/NoxiaRewardedCampaign.tsx', 'utf8');

assert.match(migration, /v_campaign\.reward_credits <> 2/);
assert.match(migration, /v_user_rewards >= 5/);
assert.match(migration, /v_user_reward_credits \+ 2 > 10/);
assert.match(migration, /if not v_claim\.watch_verified then raise exception 'watch_incomplete'/);
assert.doesNotMatch(migration, /v_claim\.action_verified/);
assert.match(analytics, /filter \(where rc\.watch_verified\)/);
assert.doesNotMatch(analytics, /watch_verified and rc\.action_verified/);
assert.match(watch, /return state\.completed && !state\.rewarded/);
assert.match(component, /visionnage complet requis/);
console.log('rewarded-watch-only-contract: OK');
