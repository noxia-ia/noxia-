-- NOXIA Phase 1 — rewarded ads are earned by a completed server-verified watch.
-- Keep earlier migrations immutable. Legacy required_action/action proof columns
-- remain for backwards compatibility and audit history, but are no longer a
-- condition for the NOXIA rewarded-ad credit.

create or replace function public.finalize_reward_claim(
  p_campaign_id uuid, p_user_id uuid, p_provider text, p_provider_subject text
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_claim public.reward_claims;
  v_campaign public.reward_campaigns;
  v_user_rewards integer;
  v_user_reward_credits integer;
begin
  if p_user_id is null or p_campaign_id is null then raise exception 'invalid_reward_claim'; end if;

  -- Serialize all rewarded-ad claims for one user: the 5 ads / +10 credits
  -- daily cap remains atomic across concurrent campaigns/tabs.
  perform pg_advisory_xact_lock(hashtextextended('rewarded-ads:' || p_user_id::text, 0));

  select * into v_campaign from public.reward_campaigns
  where id = p_campaign_id and active = true
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
  for update;
  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim from public.reward_claims
  where campaign_id = p_campaign_id and user_id = p_user_id for update;
  if not found then raise exception 'reward_claim_missing'; end if;
  if v_claim.rewarded_at is not null then return 0; end if;

  -- The server-side watch validator is authoritative. The browser timer is
  -- only presentation and cannot satisfy this condition by itself.
  if not v_claim.watch_verified then raise exception 'watch_incomplete'; end if;

  if v_campaign.max_rewards is not null then
    if (select count(*) from public.reward_claims
        where campaign_id = p_campaign_id and rewarded_at is not null) >= v_campaign.max_rewards
    then raise exception 'campaign_exhausted'; end if;
  end if;

  if v_campaign.reward_credits <> 2 then raise exception 'invalid_ad_reward'; end if;

  select count(*), coalesce(sum(credits_awarded), 0)
    into v_user_rewards, v_user_reward_credits
  from public.reward_claims
  where user_id = p_user_id
    and rewarded_at >= current_date
    and rewarded_at < current_date + interval '1 day';

  if v_user_rewards >= 5 or v_user_reward_credits + 2 > 10 then
    raise exception 'daily_reward_limit';
  end if;

  update public.profiles
     set credits = credits + 2, updated_at = now()
   where user_id = p_user_id;
  if not found then raise exception 'profile_missing'; end if;

  update public.reward_claims
     set rewarded_at = now(),
         credits_awarded = 2,
         provider = coalesce(nullif(p_provider, ''), 'noxia_rewarded_ads'),
         provider_subject = nullif(p_provider_subject, '')
   where id = v_claim.id;

  insert into public.reward_events(user_id, kind, credits, campaign_id)
  values (p_user_id, 'rewarded_campaign', 2, p_campaign_id::text);

  return 2;
end;
$$;

revoke all on function public.finalize_reward_claim(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finalize_reward_claim(uuid,uuid,text,text) to service_role;
