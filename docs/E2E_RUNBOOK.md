# E2E runbook

1. Install dependencies with `npm ci`.
2. Apply Supabase migrations in a non-production project.
3. Run the deterministic campaign contract test.
4. Create a test campaign with reward=8 and duration=30.
5. Use the internal verifier only in development.
6. Confirm one reward changes `profiles.credits` by +8.
7. Attempt a second claim and confirm the balance does not change.
8. Confirm the UI refreshes from the authoritative balance source.
9. Disable the internal verifier before production.
10. Enable only officially supported provider adapters.
