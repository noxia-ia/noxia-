# Reward server flow

watch_completed + provider_action_verified
        -> eligibility checks
        -> idempotency check
        -> existing finalize_reward_claim()
        -> profiles.credits increment
        -> realtime balance update

A failed verification produces zero credits.
