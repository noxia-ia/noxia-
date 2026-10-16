-- NOXIA Phase 1 — rewarded ads: enforce the definitive +2 credit reward at DB level.
-- Never edit earlier migrations. Existing campaign values are normalized before the constraint is installed.

update public.reward_campaigns
set reward_credits = 2
where reward_credits <> 2;

alter table public.reward_campaigns
  drop constraint if exists reward_campaigns_reward_credits_check;

alter table public.reward_campaigns
  add constraint reward_campaigns_reward_credits_check check (reward_credits = 2);
