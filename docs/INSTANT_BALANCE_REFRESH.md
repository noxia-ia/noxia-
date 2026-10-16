# Instant balance refresh

After a successful reward transaction, update the visible balance immediately
using the existing authoritative balance source (Supabase realtime/subscription,
server response, or the project's current balance store).

Do not increment the displayed balance optimistically before the server confirms
the ledger transaction. If the transaction fails, the UI must show no reward.
