-- NOXIA AI — 0017 : session de visionnage serveur, plafond de récompenses, administration des campagnes.
-- À exécuter APRÈS 0016. Toutes les écritures sensibles passent par des fonctions SECURITY DEFINER.

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Correctif 0015 : handle_new_user() avait ÉCRASÉ la version de 0008
--    (refus < 15 ans + enregistrement de la date de naissance). On fusionne les deux :
--    5 crédits de découverte ET contrôle d'âge à l'inscription.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dob date;
begin
  begin v_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date; exception when others then v_dob := null; end;
  if v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01') then v_dob := null; end if;
  if v_dob is not null and date_part('year', age(current_date, v_dob)) < 15 then raise exception 'age_restricted'; end if;
  insert into public.profiles (user_id, full_name, email, role, credits, date_of_birth, age_verified_at)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email, 'user', 5, v_dob, case when v_dob is not null then now() end);
  insert into public.subscriptions (user_id, plan, status, starts_at, credits_total, credits_remaining)
  values (new.id, 'free', 'active', now(), 5, 5);
  return new;
end; $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Correctif 0015 : reward_events.credits était limité à 10, alors qu'une campagne peut accorder jusqu'à 50.
--    Sans ce correctif, finalize_reward_claim() échouait pour toute campagne > 10 crédits.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.reward_events drop constraint if exists reward_events_credits_check;
alter table public.reward_events add constraint reward_events_credits_check check (credits > 0 and credits <= 50);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Campagnes : statut, plafond, mise à jour. « active » reste le drapeau lu par les politiques RLS
--    et par finalize_reward_claim(); il est FORCÉ à (status = 'active').
-- ───────────────────────────────────────────────────────────────────────────
alter table public.reward_campaigns
  add column if not exists status text not null default 'draft',
  add column if not exists max_rewards integer,
  add column if not exists updated_at timestamptz not null default now();

alter table public.reward_campaigns drop constraint if exists reward_campaigns_status_check;
alter table public.reward_campaigns add constraint reward_campaigns_status_check check (status in ('draft','active','paused','ended'));
alter table public.reward_campaigns drop constraint if exists reward_campaigns_max_rewards_check;
alter table public.reward_campaigns add constraint reward_campaigns_max_rewards_check check (max_rewards is null or max_rewards >= 1);

update public.reward_campaigns set status = case when active then 'active' else 'draft' end;

alter table public.reward_campaigns drop constraint if exists reward_campaigns_active_matches_status;
alter table public.reward_campaigns add constraint reward_campaigns_active_matches_status check (active = (status = 'active'));

alter table public.reward_campaigns drop constraint if exists reward_campaigns_urls_https;
alter table public.reward_campaigns add constraint reward_campaigns_urls_https
  check (video_url ~* '^https://' and destination_url ~* '^https://') not valid; -- not valid : n'échoue pas sur d'anciennes lignes, s'applique aux nouvelles

-- L'admin voit aussi les brouillons / campagnes en pause (la politique existante ne montre que les actives).
drop policy if exists "reward_campaigns_admin_read" on public.reward_campaigns;
create policy "reward_campaigns_admin_read" on public.reward_campaigns
  for select to authenticated using (public.is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Session de visionnage : l'HORLOGE DU SERVEUR décide. Le navigateur ne fait qu'afficher.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.reward_claims add column if not exists watch_started_at timestamptz;

-- Démarre (ou reprend) la session. L'heure de départ initiale est conservée : recharger la page ne remet pas le compteur à zéro.
create or replace function public.start_reward_watch(p_campaign_id uuid, p_user_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_started timestamptz;
begin
  if p_user_id is null or p_campaign_id is null then raise exception 'invalid_reward_claim'; end if;
  perform 1 from public.reward_campaigns
   where id = p_campaign_id and active = true
     and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now());
  if not found then raise exception 'campaign_inactive'; end if;

  insert into public.reward_claims (campaign_id, user_id, watch_started_at)
  values (p_campaign_id, p_user_id, now())
  on conflict (campaign_id, user_id) do nothing;

  update public.reward_claims set watch_started_at = now()
   where campaign_id = p_campaign_id and user_id = p_user_id and watch_started_at is null and rewarded_at is null;

  select watch_started_at into v_started from public.reward_claims where campaign_id = p_campaign_id and user_id = p_user_id;
  return v_started;
end; $$;

-- Valide le visionnage SEULEMENT si la durée complète s'est écoulée côté serveur depuis le départ.
create or replace function public.complete_reward_watch(p_campaign_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_claim public.reward_claims; v_campaign public.reward_campaigns;
begin
  if p_user_id is null or p_campaign_id is null then raise exception 'invalid_reward_claim'; end if;
  select * into v_campaign from public.reward_campaigns
   where id = p_campaign_id and active = true
     and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now());
  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim from public.reward_claims where campaign_id = p_campaign_id and user_id = p_user_id for update;
  if not found or v_claim.watch_started_at is null then raise exception 'watch_not_started'; end if;
  if v_claim.rewarded_at is not null or v_claim.watch_verified then return true; end if;

  if now() < v_claim.watch_started_at + make_interval(secs => v_campaign.duration_seconds) then
    raise exception 'watch_incomplete';
  end if;

  update public.reward_claims set watch_verified = true, watch_verified_at = now() where id = v_claim.id;
  return true;
end; $$;

-- Enregistre la preuve d'action fournie par un vérificateur serveur. Refusée tant que le visionnage n'est pas validé.
create or replace function public.record_reward_action_proof(p_campaign_id uuid, p_user_id uuid, p_provider text, p_provider_subject text)
returns void language plpgsql security definer set search_path = public as $$
declare v_claim public.reward_claims;
begin
  select * into v_claim from public.reward_claims where campaign_id = p_campaign_id and user_id = p_user_id for update;
  if not found then raise exception 'reward_claim_missing'; end if;
  if not v_claim.watch_verified then raise exception 'reward_conditions_not_met'; end if;
  if v_claim.rewarded_at is not null then return; end if;
  update public.reward_claims
     set action_verified = true, action_verified_at = now(), provider = p_provider, provider_subject = p_provider_subject
   where id = v_claim.id;
end; $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) finalize_reward_claim() : ajoute le plafond max_rewards. La ligne de campagne est verrouillée
--    (FOR UPDATE) pour que deux réclamations simultanées ne dépassent jamais le plafond.
-- ───────────────────────────────────────────────────────────────────────────
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
begin
  if p_user_id is null or p_campaign_id is null then raise exception 'invalid_reward_claim'; end if;

  select * into v_campaign from public.reward_campaigns
   where id = p_campaign_id and active = true
     and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
   for update;
  if not found then raise exception 'campaign_inactive'; end if;

  select * into v_claim from public.reward_claims where campaign_id = p_campaign_id and user_id = p_user_id for update;
  if not found then raise exception 'reward_claim_missing'; end if;
  if v_claim.rewarded_at is not null then return 0; end if; -- idempotent : pas de double récompense
  if not v_claim.watch_verified or not v_claim.action_verified then raise exception 'reward_conditions_not_met'; end if;

  if v_campaign.max_rewards is not null then
    select count(*) into v_given from public.reward_claims where campaign_id = p_campaign_id and rewarded_at is not null;
    if v_given >= v_campaign.max_rewards then raise exception 'campaign_exhausted'; end if;
  end if;

  v_reward := v_campaign.reward_credits;
  update public.profiles set credits = credits + v_reward where user_id = p_user_id;
  if not found then raise exception 'profile_missing'; end if;

  update public.reward_claims
     set rewarded_at = now(), credits_awarded = v_reward,
         provider = coalesce(p_provider, provider), provider_subject = coalesce(p_provider_subject, provider_subject)
   where id = v_claim.id;

  insert into public.reward_events (user_id, kind, credits, campaign_id)
  values (p_user_id, 'rewarded_campaign', v_reward, p_campaign_id::text);

  return v_reward;
end; $$;

-- Ces fonctions ne sont appelables QUE par le serveur (clé service_role).
revoke all on function public.start_reward_watch(uuid,uuid) from public, anon, authenticated;
revoke all on function public.complete_reward_watch(uuid,uuid) from public, anon, authenticated;
revoke all on function public.record_reward_action_proof(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.finalize_reward_claim(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.start_reward_watch(uuid,uuid) to service_role;
grant execute on function public.complete_reward_watch(uuid,uuid) to service_role;
grant execute on function public.record_reward_action_proof(uuid,uuid,text,text) to service_role;
grant execute on function public.finalize_reward_claim(uuid,uuid,text,text) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Administration : journal d'audit + fonctions réservées aux admins (is_admin() relu en base).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.reward_campaign_audit (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('create','update','status')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index if not exists reward_campaign_audit_campaign_idx on public.reward_campaign_audit(campaign_id, created_at desc);
alter table public.reward_campaign_audit enable row level security;
revoke all on public.reward_campaign_audit from anon, authenticated;
grant select on public.reward_campaign_audit to authenticated;
drop policy if exists "reward_campaign_audit_admin_read" on public.reward_campaign_audit;
create policy "reward_campaign_audit_admin_read" on public.reward_campaign_audit for select to authenticated using (public.is_admin());

-- Création / modification. Une campagne n'est JAMAIS activée par cette fonction : elle reste en brouillon
-- (ou garde son statut actuel) — l'activation passe par admin_set_campaign_status().
create or replace function public.admin_save_campaign(
  p_id uuid, p_slug text, p_title text, p_platform text, p_video_url text, p_destination_url text,
  p_duration_seconds integer, p_reward_credits integer, p_required_action text, p_max_rewards integer,
  p_starts_at timestamptz, p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_old public.reward_campaigns; v_new public.reward_campaigns; v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'invalid_campaign'; end if;
  if p_video_url !~* '^https://' or p_destination_url !~* '^https://' then raise exception 'invalid_url'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then raise exception 'invalid_dates'; end if;

  select * into v_old from public.reward_campaigns where id = v_id for update;
  if found then
    update public.reward_campaigns set
      title = trim(p_title), platform = p_platform, video_url = p_video_url, destination_url = p_destination_url,
      duration_seconds = p_duration_seconds, reward_credits = p_reward_credits, required_action = p_required_action,
      max_rewards = p_max_rewards, starts_at = p_starts_at, ends_at = p_ends_at, updated_at = now()
    where id = v_id returning * into v_new;
    insert into public.reward_campaign_audit (campaign_id, admin_id, action, old_values, new_values)
    values (v_id, auth.uid(), 'update', to_jsonb(v_old), to_jsonb(v_new));
  else
    insert into public.reward_campaigns (id, slug, title, platform, video_url, destination_url, duration_seconds, reward_credits,
                                         required_action, max_rewards, starts_at, ends_at, status, active)
    values (v_id, p_slug, trim(p_title), p_platform, p_video_url, p_destination_url, p_duration_seconds, p_reward_credits,
            p_required_action, p_max_rewards, p_starts_at, p_ends_at, 'draft', false)
    returning * into v_new;
    insert into public.reward_campaign_audit (campaign_id, admin_id, action, new_values) values (v_id, auth.uid(), 'create', to_jsonb(v_new));
  end if;
  return v_id;
end; $$;

create or replace function public.admin_set_campaign_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.reward_campaigns;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_status not in ('draft','active','paused','ended') then raise exception 'invalid_status'; end if;
  select * into v_old from public.reward_campaigns where id = p_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  update public.reward_campaigns set status = p_status, active = (p_status = 'active'), updated_at = now() where id = p_id;
  insert into public.reward_campaign_audit (campaign_id, admin_id, action, old_values, new_values)
  values (p_id, auth.uid(), 'status', jsonb_build_object('status', v_old.status), jsonb_build_object('status', p_status));
end; $$;

revoke all on function public.admin_save_campaign(uuid,text,text,text,text,text,integer,integer,text,integer,timestamptz,timestamptz) from public, anon;
revoke all on function public.admin_set_campaign_status(uuid,text) from public, anon;
grant execute on function public.admin_save_campaign(uuid,text,text,text,text,text,integer,integer,text,integer,timestamptz,timestamptz) to authenticated;
grant execute on function public.admin_set_campaign_status(uuid,text) to authenticated;
