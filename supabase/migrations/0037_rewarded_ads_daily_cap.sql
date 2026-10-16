-- NOXIA AI — 0037 : économie des publicités récompensées.
-- Une publicité complète = +2 crédits.
-- Maximum 5 publicités / jour et +10 crédits / jour / utilisateur.
-- Le contrôle est atomique et côté serveur.

create or replace function public.finalize_reward_claim(
  p_campaign_id uuid, p_user_id uuid, p_provider text, p_provider_subject text
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_claim public.reward_claims;
  v_campaign public.reward_campaigns;
  v_reward integer;
  v_given integer;
  v_user_rewards integer;
  v_user_reward_credits integer;
begin
  if p_user_id is null or p_campaign_id is null then raise exception 'invalid_reward_claim'; end if;

  select * into v_campaign from public.reward_campaigns
  where id = p_campaign_id and active = true
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
  for update;
  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim from public.reward_claims
  where campaign_id = p_campaign_id and user_id = p_user_id for update;
  if not found then raise exception 'reward_claim_missing'; end if;
  if v_claim.rewarded_at is not null then return 0; end if;
  if not v_claim.watch_verified or not v_claim.action_verified then raise exception 'reward_conditions_not_met'; end if;

  if v_campaign.max_rewards is not null then
    select count(*) into v_given from public.reward_claims
    where campaign_id = p_campaign_id and rewarded_at is not null;
    if v_given >= v_campaign.max_rewards then raise exception 'campaign_exhausted'; end if;
  end if;

  -- Toutes les publicités récompensées suivent désormais la même économie.
  if v_campaign.reward_credits <> 2 then raise exception 'invalid_ad_reward'; end if;
  v_reward := 2;

  select count(*), coalesce(sum(credits_awarded), 0)
  into v_user_rewards, v_user_reward_credits
  from public.reward_claims
  where user_id = p_user_id
    and rewarded_at >= current_date
    and rewarded_at < current_date + interval '1 day';

  if v_user_rewards >= 5 or v_user_reward_credits + v_reward > 10 then
    raise exception 'daily_reward_limit';
  end if;

  update public.profiles set credits = credits + v_reward, updated_at = now() where user_id = p_user_id;
  if not found then raise exception 'profile_missing'; end if;

  update public.reward_claims
  set rewarded_at = now(), credits_awarded = v_reward,
      provider = coalesce(p_provider, provider), provider_subject = coalesce(p_provider_subject, provider_subject)
  where id = v_claim.id;

  insert into public.reward_events(user_id, kind, credits, campaign_id)
  values (p_user_id, 'rewarded_campaign', v_reward, p_campaign_id::text);

  return v_reward;
end;
$$;

revoke all on function public.finalize_reward_claim(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finalize_reward_claim(uuid,uuid,text,text) to service_role;
