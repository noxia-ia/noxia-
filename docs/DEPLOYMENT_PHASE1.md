# NOXIA Phase 1 — deployment checklist

## Before deployment

Run on the computer:

```bash
npm ci
npm run typecheck
npm run test:campaigns
npm run test:db
npm run test:rewards
npm run build
```

Then apply Supabase migrations to a **development/staging** project first.

## Required environment

Never commit real secrets.

Expected public/client variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Server-only secrets (exact names depend on the existing provider adapters):
- Supabase service-role key
- AI provider keys
- media provider keys
- OAuth/provider secrets
- webhook signing secrets

Use `.env.example` as the template and keep real values only in the hosting
provider's encrypted environment settings.

## Production gates

1. Typecheck passes.
2. Campaign reward contract tests pass.
3. Supabase migrations apply cleanly.
4. Reward ledger test proves exactly +8 for one valid claim.
5. Second claim produces +0.
6. Invalid watch/action produces +0.
7. Realtime balance update is confirmed.
8. Internal test verifier is disabled.
9. Only officially supported provider adapters are enabled.
10. Secrets are absent from Git history.

## Rollback

Keep the previous deployment available until the first production smoke test
passes. Database migrations must be backward-compatible with the deployed app.
