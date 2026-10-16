# NOXIA Reward E2E acceptance criteria

## Happy path
- 30-second creative reaches completion.
- Required external action has authoritative provider evidence.
- User has no previous reward for the campaign.
- Existing `finalize_reward_claim()` succeeds.
- `profiles.credits` increases by exactly 8.
- UI receives the authoritative new balance immediately.

## Failure paths
- Watch < 30 seconds => 0 credits.
- Action not verified => 0 credits.
- Duplicate claim => 0 additional credits.
- Campaign inactive/exhausted => 0 credits.
- Ledger failure => no visible reward and no partial credit.

## Production gate
Do not enable a social campaign until its provider adapter can produce
real, authorized evidence in the intended environment.
