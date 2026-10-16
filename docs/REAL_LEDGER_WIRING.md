# Real credit ledger wiring

The project's authoritative balance is `public.profiles.credits`.

The existing `public.finalize_reward_claim()` already:
- verifies the reward claim row;
- requires watch_verified + action_verified;
- prevents duplicate rewards with rewarded_at;
- increments profiles.credits;
- records reward_events;
- runs as a security-definer transaction.

NOXIA now uses that existing ledger instead of a second ad-campaign ledger.

The client subscribes to Supabase Realtime on `profiles` so a successful
server-side reward appears immediately without a page reload.

Provider verification must still be performed by trusted server/webhook code.
