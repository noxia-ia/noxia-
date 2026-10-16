# Supabase campaign layer

Adds campaign, event and reward-accounting primitives.

The database prevents duplicate rewards per user/campaign and requires both
watch completion and action verification. The returned reward amount must be
connected to NOXIA's existing server-side credit ledger in a trusted transaction.

Provider verification (OAuth/webhook/API) must be implemented per platform.
Never trust client-only `watched=true` or `subscribed=true` flags.
