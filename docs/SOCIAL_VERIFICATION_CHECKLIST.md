# Social campaign verification — production checklist

NOXIA should support a provider adapter per platform, but only where the
platform officially permits the required verification.

For every adapter:
1. OAuth/token exchange is server-side.
2. API/webhook signatures are validated.
3. Provider user identity is mapped to the NOXIA account without storing
   unnecessary personal data.
4. Provider event IDs are stored for idempotency.
5. Evidence has a timestamp and, when applicable, an expiry.
6. The server verifies the watch-completion event independently.
7. Only after both conditions are true is the existing
   `finalize_reward_claim()` ledger function called.
8. If the platform cannot legally/technically verify the action, NOXIA must
   not promise the reward for that action.

The browser is never authoritative for rewards.
