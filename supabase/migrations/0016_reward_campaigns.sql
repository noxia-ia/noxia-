-- NOXIA AI — campagnes publicitaires récompensées
-- Principe : une récompense n'est accordée que lorsque le serveur confirme
-- les DEUX conditions d'une campagne : visionnage complet + action sociale vérifiée.
-- Aucune récompense n'est accordée sur simple clic ou sur une affirmation du navigateur.

alter table public.reward_events
  drop constraint if exists reward_events_kind_check;
alter table public.reward_events
  add constraint reward_events_kind_check
  check (kind in ('ad_completed','campaign_click','referral','rewarded_campaign'));

create table if not exists public.reward_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  platform text not null check (platform in ('tiktok','youtube','instagram','facebook','other')),
  video_url text not null,
  destination_url text not null,
  duration_seconds integer not null default 30 check (duration_seconds >= 5 and duration_seconds <= 300),
  reward_credits integer not null default 8 check (reward_credits > 0 and reward_credits <= 50),
  required_action text not null default 'subscribe' check (required_action in ('subscribe','follow','like','visit')),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.reward_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  watch_verified boolean not null default false,
  action_verified boolean not null default false,
  watch_verified_at timestamptz,
  action_verified_at timestamptz,
  provider text,
  provider_subject text,
  rewarded_at timestamptz,
  credits_awarded integer not null default 0 check (credits_awarded >= 0 and credits_awarded <= 50),
  created_at timestamptz not null default now(),
  unique(campaign_id, user_id)
);

create index if not exists reward_campaigns_active_idx on public.reward_campaigns(active, starts_at, ends_at);
create index if not exists reward_claims_user_idx on public.reward_claims(user_id, created_at desc);

alter table public.reward_campaigns enable row level security;
alter table public.reward_claims enable row level security;

-- Les campagnes actives peuvent être lues par les utilisateurs connectés.
create policy "reward_campaigns_read_active" on public.reward_campaigns
  for select to authenticated
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

-- L'utilisateur peut uniquement consulter ses propres réclamations.
create policy "reward_claims_select_own" on public.reward_claims
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.reward_campaigns from anon;
revoke all on public.reward_claims from anon, authenticated;
grant select on public.reward_campaigns to authenticated;
grant select on public.reward_claims to authenticated;

-- Création/mise à jour des preuves : service_role uniquement.
revoke insert, update, delete on public.reward_campaigns from authenticated;
revoke insert, update, delete on public.reward_claims from authenticated;

-- Récompense atomique : les deux preuves doivent être vraies et la campagne active.
create or replace function public.finalize_reward_claim(
  p_campaign_id uuid,
  p_user_id uuid,
  p_provider text,
  p_provider_subject text
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_claim public.reward_claims;
  v_campaign public.reward_campaigns;
  v_reward integer;
begin
  if p_user_id is null or p_campaign_id is null then
    raise exception 'invalid_reward_claim';
  end if;

  select * into v_campaign
  from public.reward_campaigns
  where id = p_campaign_id
    and active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now());

  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim
  from public.reward_claims
  where campaign_id = p_campaign_id and user_id = p_user_id
  for update;

  if not found then raise exception 'reward_claim_missing'; end if;
  if not v_claim.watch_verified or not v_claim.action_verified then
    raise exception 'reward_conditions_not_met';
  end if;
  if v_claim.rewarded_at is not null then
    return 0; -- idempotent : pas de double récompense
  end if;

  v_reward := v_campaign.reward_credits;

  update public.profiles
  set credits = credits + v_reward
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
