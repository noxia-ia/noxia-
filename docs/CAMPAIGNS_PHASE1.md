# NOXIA Campaigns — Phase 1

## Campaign lifecycle

DRAFT -> ACTIVE -> PAUSED -> COMPLETED

An active campaign contains:
- advertiser/campaign owner
- destination URL
- creative/video URL
- duration (default 30 seconds)
- required action
- reward credits (default 8)
- maximum rewarded completions
- budget/campaign accounting

## Reward verification

A reward is granted only after the server verifies:
1. the user was eligible for the campaign;
2. the creative reached the required watch-completion threshold;
3. the required external action was verified through an approved provider mechanism;
4. this user has not already claimed this campaign;
5. the campaign still has available reward budget/capacity.

The browser must never be trusted to award credits directly.

## Anti-abuse

The production implementation should add:
- idempotency keys for reward claims;
- unique `(user_id, campaign_id)` reward records;
- rate limits;
- server-side timestamps;
- campaign budget limits;
- fraud/risk flags;
- provider webhook/signature validation where supported.

## Important platform constraint

NOXIA must not manufacture or sell fake followers, likes, views, or engagement.
For TikTok/YouTube/Instagram/Facebook actions, use only APIs, OAuth, webhooks,
or other verification mechanisms officially permitted by the respective platform.
If an action cannot be legitimately verified, that action cannot be used as a
guaranteed reward condition.

## Example

Video generation cost: 30 credits.
Campaign: 30-second video.
Reward: +8 credits.

Watch completion + verified required action = +8 credits.
Missing either condition = 0 credits.
