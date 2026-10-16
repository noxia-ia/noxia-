-- NOXIA AI — 0018 : présence de visionnage + anti-abus de récompenses.
-- Cette couche ne prétend PAS prouver qu'une personne regarde réellement une vidéo.
-- Elle réduit les abus trivaux : appels directs, sessions oubliées, spam de heartbeat
-- et réclamations massives. La preuve sociale reste côté fournisseur officiel.

alter table public.reward_claims
  add column if not exists watch_last_heartbeat_at timestamptz,
  add column if not exists watch_heartbeat_count integer not null default 0;

alter table public.reward_claims
  drop constraint if exists reward_claims_heartbeat_count_check;
alter table public.reward_claims
  add constraint reward_claims_heartbeat_count_check
  check (watch_heartbeat_count >= 0);

-- Un heartbeat est uniquement une preuve de présence du client pendant la session.
-- Le serveur reste l'autorité pour l'heure de départ et la durée minimale.
create or replace function public.heartbeat_reward_watch(p_campaign_id uuid, p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_claim public.reward_claims;
  v_campaign public.reward_campaigns;
begin
  if p_user_id is null or p_campaign_id is null then
    raise exception 'invalid_reward_claim';
  end if;

  select * into v_campaign
  from public.reward_campaigns
  where id = p_campaign_id and active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now());
  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim
  from public.reward_claims
  where campaign_id = p_campaign_id and user_id = p_user_id
  for update;
  if not found or v_claim.watch_started_at is null then raise exception 'watch_not_started'; end if;
  if v_claim.rewarded_at is not null then return true; end if;

  -- Refuse unbounded heartbeat spam : au plus un point toutes les 2 secondes.
  if v_claim.watch_last_heartbeat_at is not null
     and now() < v_claim.watch_last_heartbeat_at + interval '2 seconds' then
    return true;
  end if;

  update public.reward_claims
     set watch_last_heartbeat_at = now(),
         watch_heartbeat_count = watch_heartbeat_count + 1
   where id = v_claim.id;
  return true;
end;
$$;

revoke all on function public.heartbeat_reward_watch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_reward_watch(uuid,uuid) to service_role;

-- La session doit avoir eu une présence récente avant de pouvoir être clôturée.
-- 15 s laisse une marge pour les appareils mobiles et les variations réseau.
create or replace function public.complete_reward_watch(p_campaign_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_claim public.reward_claims;
  v_campaign public.reward_campaigns;
begin
  if p_user_id is null or p_campaign_id is null then raise exception 'invalid_reward_claim'; end if;

  select * into v_campaign from public.reward_campaigns
   where id = p_campaign_id and active = true
     and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now());
  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim from public.reward_claims
   where campaign_id = p_campaign_id and user_id = p_user_id for update;
  if not found or v_claim.watch_started_at is null then raise exception 'watch_not_started'; end if;
  if v_claim.rewarded_at is not null or v_claim.watch_verified then return true; end if;

  if now() < v_claim.watch_started_at + make_interval(secs => v_campaign.duration_seconds) then
    raise exception 'watch_incomplete';
  end if;

  if v_claim.watch_last_heartbeat_at is null
     or v_claim.watch_last_heartbeat_at < now() - interval '15 seconds' then
    raise exception 'watch_presence_missing';
  end if;

  update public.reward_claims
     set watch_verified = true, watch_verified_at = now()
   where id = v_claim.id;
  return true;
end; $$;

-- Plafond anti-abus global : 20 récompenses de campagnes / utilisateur / 24 h.
-- Il ne remplace pas max_rewards (qui reste le plafond de la campagne).
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
begin
  if p_user_id is null or p_campaign_id is null then raise exception 'invalid_reward_claim'; end if;

  select * into v_campaign from public.reward_campaigns
   where id = p_campaign_id and active = true
     and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
   for update;
  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim from public.reward_claims where campaign_id = p_campaign_id and user_id = p_user_id for update;
  if not found then raise exception 'reward_claim_missing'; end if;
  if v_claim.rewarded_at is not null then return 0; end if;
  if not v_claim.watch_verified or not v_claim.action_verified then raise exception 'reward_conditions_not_met'; end if;

  if v_campaign.max_rewards is not null then
    select count(*) into v_given
    from public.reward_claims
    where campaign_id = p_campaign_id and rewarded_at is not null;
    if v_given >= v_campaign.max_rewards then raise exception 'campaign_exhausted'; end if;
  end if;

  select count(*) into v_user_rewards
  from public.reward_claims
  where user_id = p_user_id
    and rewarded_at >= now() - interval '24 hours';
  if v_user_rewards >= 20 then raise exception 'daily_reward_limit'; end if;

  v_reward := v_campaign.reward_credits;
  update public.profiles set credits = credits + v_reward where user_id = p_user_id;
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
