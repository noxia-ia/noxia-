-- NOXIA 0052 : Dashboard admin Zero-Knowledge, stats médias, compteur public,
-- module NSFW / mini-séries (garde-fous), analytics marketing (ROI / CAC).
-- À coller dans Supabase SQL Editor. Aucune lecture du contenu des messages.
-- Principe ZK : les RPC admin ne retournent QUE des agrégats (counts, sums, rates).
-- Aucune colonne de texte libre (prompt, message, result, memory) n'est sélectionnée.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Prérequis : is_admin() doit déjà exister (0002).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Compteur PUBLIC d'inscriptions (agrégat anonyme, pour l'interface publique)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.public_signup_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.profiles;
$$;

revoke all on function public.public_signup_count() from public;
grant execute on function public.public_signup_count() to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Overview admin enrichi (plans, crédits, moteurs médias) — agrégats seuls
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.admin_analytics_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  with latest_sub as (
    select distinct on (s.user_id) s.user_id, s.plan, s.status, s.expires_at
    from public.subscriptions s
    order by s.user_id, s.created_at desc
  ),
  plan_counts as (
    select coalesce(jsonb_object_agg(plan, cnt), '{}'::jsonb) as value
    from (
      select plan, count(*)::bigint as cnt
      from latest_sub
      where status = 'active' and (expires_at is null or expires_at >= now())
      group by plan
    ) x
  ),
  generation_stats as (
    select
      count(*)::bigint as total,
      count(*) filter (where status = 'completed')::bigint as completed,
      count(*) filter (where status = 'failed')::bigint as failed,
      count(*) filter (where status in ('pending', 'processing'))::bigint as in_flight,
      coalesce(sum(credits_used), 0)::bigint as credits_consumed,
      count(*) filter (where created_at >= now() - interval '30 days')::bigint as last_30_days,
      coalesce(sum(credits_used) filter (where created_at >= now() - interval '30 days'), 0)::bigint as credits_30_days
    from public.generations
  ),
  media_by_module as (
    select coalesce(jsonb_object_agg(module, cnt), '{}'::jsonb) as value
    from (
      select coalesce(module, 'unknown') as module, count(*)::bigint as cnt
      from public.generations
      where status = 'completed'
      group by module
    ) x
  ),
  media_by_provider as (
    select coalesce(jsonb_object_agg(provider, cnt), '{}'::jsonb) as value
    from (
      select coalesce(provider, 'unknown') as provider, count(*)::bigint as cnt
      from public.generations
      where status = 'completed' and provider is not null
      group by provider
      order by count(*) desc
      limit 30
    ) x
  ),
  recent_active as (
    select count(distinct user_id)::bigint as users
    from public.generations
    where created_at >= now() - interval '30 days'
  ),
  reward_stats as (
    select
      count(*) filter (where kind = 'daily_streak')::bigint as daily_claims,
      coalesce(sum(credits) filter (where kind = 'daily_streak'), 0)::bigint as daily_credits,
      count(*) filter (where kind = 'rewarded_campaign')::bigint as rewarded_ad_claims,
      coalesce(sum(credits) filter (where kind = 'rewarded_campaign'), 0)::bigint as rewarded_ad_credits
    from public.reward_events
  ),
  age_stats as (
    select
      count(*) filter (where age_verified is true)::bigint as age_verified,
      count(*) filter (where age_verified is not true)::bigint as age_unverified
    from public.profiles
  )
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'new_users_30_days', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'active_users_30_days', (select users from recent_active),
    'plans_active', (select value from plan_counts),
    'generations_total', (select total from generation_stats),
    'generations_completed', (select completed from generation_stats),
    'generations_failed', (select failed from generation_stats),
    'generations_in_flight', (select in_flight from generation_stats),
    'generations_30_days', (select last_30_days from generation_stats),
    'credits_consumed', (select credits_consumed from generation_stats),
    'credits_consumed_30_days', (select credits_30_days from generation_stats),
    'media_by_module', (select value from media_by_module),
    'media_by_provider', (select value from media_by_provider),
    'daily_claims', (select daily_claims from reward_stats),
    'daily_credits_distributed', (select daily_credits from reward_stats),
    'rewarded_ad_claims', (select rewarded_ad_claims from reward_stats),
    'rewarded_ad_credits', (select rewarded_ad_credits from reward_stats),
    'age_verified_users', (select age_verified from age_stats),
    'age_unverified_users', (select age_unverified from age_stats)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_analytics_overview() from public, anon;
grant execute on function public.admin_analytics_overview() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Taux d'utilisation des moteurs médias (module × provider, 30j)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.admin_media_engine_usage(p_days integer default 30)
returns table (
  module text,
  provider text,
  generations bigint,
  completed bigint,
  failed bigint,
  credits_used bigint,
  share_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_total numeric;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select greatest(count(*)::numeric, 1)
  into v_total
  from public.generations g
  where g.created_at >= now() - (v_days || ' days')::interval;

  return query
  select
    coalesce(g.module, 'unknown')::text,
    coalesce(g.provider, 'unknown')::text,
    count(*)::bigint,
    count(*) filter (where g.status = 'completed')::bigint,
    count(*) filter (where g.status = 'failed')::bigint,
    coalesce(sum(g.credits_used), 0)::bigint,
    round((count(*)::numeric / v_total) * 100, 2)
  from public.generations g
  where g.created_at >= now() - (v_days || ' days')::interval
  group by coalesce(g.module, 'unknown'), coalesce(g.provider, 'unknown')
  order by count(*) desc
  limit 100;
end;
$$;

revoke all on function public.admin_media_engine_usage(integer) from public, anon;
grant execute on function public.admin_media_engine_usage(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Module NSFW / contenus sensibles — paramètres globaux (pas de messages)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.admin_content_settings (
  id int primary key default 1 check (id = 1), -- singleton
  nsfw_enabled boolean not null default false,
  nsfw_requires_age_verified boolean not null default true,
  nsfw_requires_paid_plan boolean not null default true,
  mini_series_nsfw_allowed boolean not null default false,
  content_policy_mode text not null default 'strict'
    check (content_policy_mode in ('strict')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.admin_content_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.admin_content_settings enable row level security;
revoke all on public.admin_content_settings from anon, authenticated;
-- Lecture admin via RPC uniquement ; écriture service_role / RPC admin.

create or replace function public.admin_get_content_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r public.admin_content_settings%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.admin_content_settings where id = 1;
  if not found then
    return jsonb_build_object(
      'nsfw_enabled', false,
      'nsfw_requires_age_verified', true,
      'nsfw_requires_paid_plan', true,
      'mini_series_nsfw_allowed', false,
      'content_policy_mode', 'strict'
    );
  end if;
  return jsonb_build_object(
    'nsfw_enabled', r.nsfw_enabled,
    'nsfw_requires_age_verified', r.nsfw_requires_age_verified,
    'nsfw_requires_paid_plan', r.nsfw_requires_paid_plan,
    'mini_series_nsfw_allowed', r.mini_series_nsfw_allowed,
    'content_policy_mode', r.content_policy_mode,
    'updated_at', r.updated_at
  );
end;
$$;

revoke all on function public.admin_get_content_settings() from public, anon;
grant execute on function public.admin_get_content_settings() to authenticated;

create or replace function public.admin_update_content_settings(
  p_nsfw_enabled boolean,
  p_nsfw_requires_age_verified boolean,
  p_nsfw_requires_paid_plan boolean,
  p_mini_series_nsfw_allowed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  -- Garde-fou légal : on ne peut jamais désactiver l'exigence d'âge si NSFW est activé
  if p_nsfw_enabled and not p_nsfw_requires_age_verified then
    raise exception 'age_verification_required_for_nsfw';
  end if;

  insert into public.admin_content_settings (
    id, nsfw_enabled, nsfw_requires_age_verified, nsfw_requires_paid_plan,
    mini_series_nsfw_allowed, updated_at, updated_by
  ) values (
    1, p_nsfw_enabled, p_nsfw_requires_age_verified, p_nsfw_requires_paid_plan,
    p_mini_series_nsfw_allowed, now(), auth.uid()
  )
  on conflict (id) do update set
    nsfw_enabled = excluded.nsfw_enabled,
    nsfw_requires_age_verified = excluded.nsfw_requires_age_verified,
    nsfw_requires_paid_plan = excluded.nsfw_requires_paid_plan,
    mini_series_nsfw_allowed = excluded.mini_series_nsfw_allowed,
    updated_at = now(),
    updated_by = auth.uid();

  return public.admin_get_content_settings();
end;
$$;

revoke all on function public.admin_update_content_settings(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_update_content_settings(boolean, boolean, boolean, boolean) to authenticated;

-- Stats NSFW agrégées : compteurs de blocages modération + générations CONTENT_BLOCKED
-- JAMAIS le texte des prompts bloqués.
create or replace function public.admin_nsfw_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'content_blocked_generations', (
      select count(*)::bigint from public.generations
      where error_code = 'CONTENT_BLOCKED'
        and created_at >= now() - (v_days || ' days')::interval
    ),
    'age_restricted_generations', (
      select count(*)::bigint from public.generations
      where error_code = 'AGE_RESTRICTED'
        and created_at >= now() - (v_days || ' days')::interval
    ),
    'age_verified_users', (
      select count(*)::bigint from public.profiles where age_verified is true
    ),
    'age_unverified_users', (
      select count(*)::bigint from public.profiles where age_verified is not true
    ),
    'window_days', v_days
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_nsfw_stats(integer) from public, anon;
grant execute on function public.admin_nsfw_stats(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Marketing / Ads — sources de trafic + dépenses + ROI
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.marketing_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 1 and 40),
  label text not null check (char_length(label) between 1 and 80),
  channel text not null check (channel in (
    'organic', 'paid_search', 'paid_social', 'influencer', 'affiliate',
    'email', 'referral', 'direct', 'other'
  )),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_spend (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.marketing_sources(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'USD', 'XOF')),
  clicks integer not null default 0 check (clicks >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (period_end >= period_start)
);

create index if not exists marketing_spend_source_period_idx
  on public.marketing_spend(source_id, period_start desc);

-- Attribution légère à l'inscription (code source uniquement, pas de PII)
alter table public.profiles
  add column if not exists acquisition_source text
  check (acquisition_source is null or char_length(acquisition_source) <= 40);

create index if not exists profiles_acquisition_source_idx
  on public.profiles(acquisition_source)
  where acquisition_source is not null;

alter table public.marketing_sources enable row level security;
alter table public.marketing_spend enable row level security;
revoke all on public.marketing_sources from anon, authenticated;
revoke all on public.marketing_spend from anon, authenticated;

-- Analytics marketing agrégées (CAC, conversion, ROI par source)
create or replace function public.admin_marketing_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  with spend as (
    select
      s.id as source_id,
      s.code,
      s.label,
      s.channel,
      coalesce(sum(sp.amount_cents), 0)::bigint as spend_cents,
      coalesce(sum(sp.clicks), 0)::bigint as clicks,
      coalesce(sum(sp.impressions), 0)::bigint as impressions
    from public.marketing_sources s
    left join public.marketing_spend sp
      on sp.source_id = s.id
     and sp.period_start >= (current_date - v_days)
    where s.active = true
    group by s.id, s.code, s.label, s.channel
  ),
  signups as (
    select
      coalesce(p.acquisition_source, 'direct') as code,
      count(*)::bigint as signups
    from public.profiles p
    where p.created_at >= now() - (v_days || ' days')::interval
    group by coalesce(p.acquisition_source, 'direct')
  ),
  -- Revenus approximés via abonnements payants actifs créés dans la fenêtre
  -- (pas de données de paiement brutes exposées)
  revenue as (
    select
      coalesce(p.acquisition_source, 'direct') as code,
      count(*)::bigint as paid_conversions,
      -- estimation : on compte les conversions, le montant exact dépend de pricing
      count(*)::bigint as conversions
    from public.subscriptions sub
    join public.profiles p on p.id = sub.user_id or p.user_id = sub.user_id
    where sub.plan <> 'free'
      and sub.status = 'active'
      and sub.created_at >= now() - (v_days || ' days')::interval
    group by coalesce(p.acquisition_source, 'direct')
  ),
  joined as (
    select
      coalesce(sp.code, su.code, rv.code) as code,
      coalesce(sp.label, sp.code, su.code, rv.code) as label,
      coalesce(sp.channel, 'other') as channel,
      coalesce(sp.spend_cents, 0) as spend_cents,
      coalesce(sp.clicks, 0) as clicks,
      coalesce(sp.impressions, 0) as impressions,
      coalesce(su.signups, 0) as signups,
      coalesce(rv.paid_conversions, 0) as paid_conversions
    from spend sp
    full outer join signups su on su.code = sp.code
    full outer join revenue rv on rv.code = coalesce(sp.code, su.code)
  )
  select jsonb_build_object(
    'window_days', v_days,
    'sources', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', j.code,
          'label', j.label,
          'channel', j.channel,
          'spend_cents', j.spend_cents,
          'clicks', j.clicks,
          'impressions', j.impressions,
          'signups', j.signups,
          'paid_conversions', j.paid_conversions,
          'ctr_pct', case when j.impressions > 0
            then round((j.clicks::numeric / j.impressions) * 100, 2) else 0 end,
          'cvr_pct', case when j.clicks > 0
            then round((j.signups::numeric / j.clicks) * 100, 2) else 0 end,
          'cac_cents', case when j.signups > 0
            then (j.spend_cents / j.signups) else null end,
          'paid_cvr_pct', case when j.signups > 0
            then round((j.paid_conversions::numeric / j.signups) * 100, 2) else 0 end
        )
        order by j.spend_cents desc, j.signups desc
      )
      from joined j
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'spend_cents', coalesce(sum(spend_cents), 0),
        'clicks', coalesce(sum(clicks), 0),
        'impressions', coalesce(sum(impressions), 0),
        'signups', coalesce(sum(signups), 0),
        'paid_conversions', coalesce(sum(paid_conversions), 0)
      )
      from joined
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_marketing_analytics(integer) from public, anon;
grant execute on function public.admin_marketing_analytics(integer) to authenticated;

-- CRUD sources / spend (admin only)
create or replace function public.admin_upsert_marketing_source(
  p_code text,
  p_label text,
  p_channel text,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.marketing_sources (code, label, channel, active)
  values (lower(trim(p_code)), trim(p_label), p_channel, p_active)
  on conflict (code) do update set
    label = excluded.label,
    channel = excluded.channel,
    active = excluded.active
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_upsert_marketing_source(text, text, text, boolean) from public, anon;
grant execute on function public.admin_upsert_marketing_source(text, text, text, boolean) to authenticated;

create or replace function public.admin_add_marketing_spend(
  p_source_code text,
  p_period_start date,
  p_period_end date,
  p_amount_cents integer,
  p_currency text default 'EUR',
  p_clicks integer default 0,
  p_impressions integer default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source uuid;
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select id into v_source from public.marketing_sources where code = lower(trim(p_source_code));
  if v_source is null then raise exception 'unknown_source'; end if;

  insert into public.marketing_spend (
    source_id, period_start, period_end, amount_cents, currency,
    clicks, impressions, notes, created_by
  ) values (
    v_source, p_period_start, p_period_end, p_amount_cents, coalesce(p_currency, 'EUR'),
    coalesce(p_clicks, 0), coalesce(p_impressions, 0),
    left(nullif(trim(p_notes), ''), 500), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_add_marketing_spend(text, date, date, integer, text, integer, integer, text) from public, anon;
grant execute on function public.admin_add_marketing_spend(text, date, date, integer, text, integer, integer, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Garde-fou paiement / âge : RPC lecture seule pour le checkout
--    (le serveur de paiement vérifie age_verified + settings NSFW sans lire les chats)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.user_payment_eligibility()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_age boolean;
  v_settings public.admin_content_settings%rowtype;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select coalesce(age_verified, false) into v_age
  from public.profiles
  where id = uid or user_id = uid
  limit 1;

  select * into v_settings from public.admin_content_settings where id = 1;

  return jsonb_build_object(
    'age_verified', coalesce(v_age, false),
    'nsfw_enabled', coalesce(v_settings.nsfw_enabled, false),
    'nsfw_requires_age_verified', coalesce(v_settings.nsfw_requires_age_verified, true),
    'nsfw_requires_paid_plan', coalesce(v_settings.nsfw_requires_paid_plan, true),
    'can_access_nsfw', (
      coalesce(v_settings.nsfw_enabled, false)
      and (not coalesce(v_settings.nsfw_requires_age_verified, true) or coalesce(v_age, false))
    )
  );
end;
$$;

revoke all on function public.user_payment_eligibility() from public, anon;
grant execute on function public.user_payment_eligibility() to authenticated;

-- Sources marketing de départ (optionnel)
insert into public.marketing_sources (code, label, channel) values
  ('direct', 'Direct / Inconnu', 'direct'),
  ('organic', 'Organique', 'organic'),
  ('google_ads', 'Google Ads', 'paid_search'),
  ('meta_ads', 'Meta Ads', 'paid_social'),
  ('tiktok_ads', 'TikTok Ads', 'paid_social')
on conflict (code) do nothing;
