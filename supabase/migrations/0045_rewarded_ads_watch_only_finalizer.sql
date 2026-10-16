-- NOXIA Phase 1 — definitive rewarded-ad finalizer.
-- Previous migrations remain immutable. The reward condition is now ONLY a
-- server-validated complete watch. Legacy action_verified columns remain for
-- backward compatibility but are no longer required for Phase 1 rewards.
create or replace function public.finalize_reward_claim(
  p_campaign_id uuid, p_user_id uuid, p_provider text, p_provider_subject text
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_claim public.reward_claims;
  v_campaign public.reward_campaigns;
  v_reward integer := 2;
  v_given integer;
  v_user_rewards integer;
  v_user_reward_credits integer;
begin
  if p_user_id is null or p_campaign_id is null then raise exception 'invalid_reward_claim'; end if;

  perform pg_advisory_xact_lock(hashtextextended('rewarded-ads:' || p_user_id::text, 0));

  select * into v_campaign from public.reward_campaigns
  where id = p_campaign_id and active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  for update;
  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim from public.reward_claims
  where campaign_id = p_campaign_id and user_id = p_user_id
  for update;
  if not found then raise exception 'reward_claim_missing'; end if;
  if v_claim.rewarded_at is not null then return 0; end if;

  -- Definitive Phase 1 rule: a complete server-validated watch is sufficient.
  if not v_claim.watch_verified then raise exception 'watch_incomplete'; end if;

  if v_campaign.max_rewards is not null then
    select count(*) into v_given from public.reward_claims
    where campaign_id = p_campaign_id and rewarded_at is not null;
    if v_given >= v_campaign.max_rewards then raise exception 'campaign_exhausted'; end if;
  end if;

  if v_campaign.reward_credits <> 2 then raise exception 'invalid_ad_reward'; end if;

  select count(*), coalesce(sum(credits_awarded), 0)
  into v_user_rewards, v_user_reward_credits
  from public.reward_claims
  where user_id = p_user_id
    and rewarded_at >= current_date
    and rewarded_at < current_date + interval '1 day';

  if v_user_rewards >= 5 or v_user_reward_credits + v_reward > 10 then
    raise exception 'daily_reward_limit';
  end if;

  update public.profiles
  set credits = credits + v_reward, updated_at = now()
  where user_id = p_user_id;
  if not found then raise exception 'profile_missing'; end if;

  update public.reward_claims
  set rewarded_at = now(), credits_awarded = v_reward,
      provider = coalesce(p_provider, provider),
      provider_subject = coalesce(p_provider_subject, provider_subject)
  where id = v_claim.id;

  insert into public.reward_events(user_id, kind, credits, campaign_id)
  values (p_user_id, 'rewarded_campaign', v_reward, p_campaign_id::text);

  return v_reward;
end;
$$;

revoke all on function public.finalize_reward_claim(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finalize_reward_claim(uuid,uuid,text,text) to service_role;
