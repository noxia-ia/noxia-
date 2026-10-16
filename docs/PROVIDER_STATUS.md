# Provider status

## Internal
Ready for local integration tests only.

## YouTube / TikTok / Instagram / Facebook
NOXIA uses provider adapters, but production verification must be implemented
only after confirming that the selected platform/API and the user's account
authorization permit the exact action being rewarded.

Do not ship a fake adapter that returns `actionVerified=true`.

The verification registry fails closed when no provider is configured.
