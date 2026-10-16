# Exact credit-ledger audit


### supabase/migrations/0003_code_generations.sql
create or replace function public.finalize_generation(
  p_generation_id uuid, p_status text, p_result jsonb default null, p_credits integer default 0, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.generations%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  select * into g from public.generations where id = p_generation_id and user_id = auth.uid() for update;
  if not found then raise exception 'generation_not_found'; end if;
  if g.status not in ('pending','processing') then raise exception 'already_finalized'; end if;

### supabase/migrations/0009_provider_architecture.sql
create function public.finalize_generation(
  p_generation_id uuid, p_status text, p_result jsonb default null, p_credits integer default 0, p_error text default null,
  p_provider text default null, p_job_id text default null, p_error_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.generations%rowtype;
begin
  if p_status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  select * into g from public.generations where id = p_generation_id for update;
  if not found then raise exception 'generation_not_found'; end if;
  if g.status not in ('pending','processing') then raise exception 'already_finalized'; end if;   -- jamais de second débit
  if p_provider is not null and g.provider is not null and g.provider <> p_provider then raise exception 'provider_mismatch'; end if;
  if p_job_id is not null and g.provider_job_id is not null and g.provider_job_id <> p_job_id then raise exception 'job_
create function public.admin_provider_stats(p_since timestamptz default now() - interval '30 days')
returns table (module text, provider text, completed bigint, failed bigint, timeouts bigint, provider_errors bigint, credits_used bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
    select g.module, coalesce(g.provider, '—'),
      count(*) filter (where g.status = 'completed'), count(*) filter (where g.status = 'failed'),
      count(*) filter (where g.error_code = 'PROVIDER_TIMEOUT'),
      count(*) filter (where g.error_code in ('PROVIDER_UNAVAILABLE','PROVIDER_RATE_LIMIT','PROVIDER_MISCONFIGURED','GENERATION_FAILED','RESULT_INVALID')),
      coalesce(sum(g.credits_used) filter (where g.status = 'completed'), 0)::bigint
    from public.generations g where g.created_at >= p_since group by g.module, coalesce(g.provider, '—')
    union all

### supabase/migrations/0001_init.sql
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','daily','weekly','monthly','annual')),
  status text not null default 'active' check (status in ('active','expired','cancelled','pending')),
  starts_at timestamptz,
  expires_at timestamptz,
  credits_total integer not null default 0 check (credits_total >= 0),
  credits_remaining integer not null default 0 check (credits_remaining >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions(user_id);
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('code','asmr','video','agents')),
  prompt text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  credits_used integer not null default 0 check (credits_used >= 0),
  result_url text,
  created_at timestamptz not null default now()
);
create index generations_user_id_idx on public.generations(user_id, created_at desc);
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, email, role, credits)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email, 'user', 0);
  insert into public.subscriptions (user_id, plan, status, starts_at)
  values (new.id, 'free', 'active', now());
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

### supabase/migrations/0008_age_safety.sql
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dob date;
begin
  begin v_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date; exception when others then v_dob := null; end;
  if v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01') then v_dob := null; end if;
  if v_dob is not null and date_part('year', age(current_date, v_dob)) < 15 then raise exception 'age_restricted'; end if;
  insert into public.profiles (user_id, full_name, email, role, credits, date_of_birth, age_verified_at)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''), new.email, 'user', 0, v_dob, case when v_dob is not null then now() end);
  insert into public.subscriptions (user_id, plan, status, starts_at) values (new.id, 'free', 'active', now());
  return new;
end; $$;

### supabase/migrations/0015_noxia_rewards.sql
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, email, role, credits)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email, 'user', 5);
  insert into public.subscriptions (user_id, plan, status, starts_at, credits_total, credits_remaining)
  values (new.id, 'free', 'active', now(), 5, 5);
  return new;
end; $$;
create table if not exists public.reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ad_completed','campaign_click','referral')),
  credits integer not null check (credits > 0 and credits <= 10),
  campaign_id text,
  created_at timestamptz not null default now()
);
create index if not exists reward_events_user_idx on public.reward_events(user_id, created_at desc);
alter table public.reward_events enable row level security;
revoke all on public.reward_events from anon, authenticated;
grant select on public.reward_events to authenticated;
create policy "reward_events_select_own" on public.reward_events
  for select to authenticated using (auth.uid() = user_id);


### supabase/migrations/0016_reward_campaigns.sql
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

### supabase/migrations/20261004_noxia_credit_ledger_adapter.sql
create or replace function public.grant_campaign_reward(
  p_campaign_id uuid,
  p_user_id uuid,
  p_reward_credits integer,
  p_idempotency_key text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reward_credits <= 0 then
    raise exception 'invalid_reward';
  end if;

### supabase/migrations/0002_subscriptions_admin.sql
create table public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('activate','renew','suspend','expire','credits')),
  old_plan text, new_plan text,
  old_status text, new_status text,
  old_expires_at timestamptz, new_expires_at timestamptz,
  credits_delta integer not null default 0,
  created_at timestamptz not null default now()
);
create index subscription_history_user_idx on public.subscription_history(user_id, created_at desc);
alter table public.subscription_history enable row level security;
revoke all on public.subscription_history from anon, authenticated;
grant select on public.subscription_history to authenticated;
create policy "history_select_own" on public.subscription_history for select to authent
create or replace function public.admin_update_subscription(
  p_user_id uuid, p_action text, p_plan text default null,
  p_starts_at timestamptz default null, p_expires_at timestamptz default null, p_credits integer default 0)
returns void language plpgsql security definer set search_path = public as $$
declare o public.subscriptions%rowtype; v public.subscriptions%rowtype; had boolean;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_action not in ('activate','renew','suspend','expire') then raise exception 'invalid_action'; end if;
  if coalesce(p_credits,0) < 0 then raise exception 'invalid_credits'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then raise exception 'user_not_found'; end if;
create or replace function public.admin_adjust_credits(p_user_id uuid, p_delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_new integer;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'invalid_credits'; end if;
  update public.profiles set credits = credits + p_delta where user_id = p_user_id returning credits into v_new; -- check (credits >= 0) bloque le négatif
  if not found then raise exception 'user_not_found'; end if;
  insert into public.subscription_history (user_id, admin_id, action, credits_delta) values (p_user_id, auth.uid(), 'credits', p_delta);
  return v_new;
end; $$;
create or replace function public.consume_credits(p_amount integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  update public.profiles set credits = credits - p_amount where user_id = auth.uid() and credits >= p_amount;
  return found;
end; $$;

### supabase/migrations/0006_agents.sql
create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '' check (char_length(content) <= 20000),
  status text not null default 'completed' check (status in ('pending','completed','failed')),
  credits_used integer not null default 0 check (credits_used >= 0),
  error_message text,
  provider text,
  created_at timestamptz not null default now(),
  check (role <> 'user' or char_length(btrim(content)) > 0)
);
create index agent_msg_conv_idx on public.agent_messages(conversation_id, seq);
create function public.finalize_agent_message(
  p_message_id uuid, p_status text, p_content text default null, p_credits integer default 0, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m public.agent_messages%rowtype;
begin
  if p_status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  select * into m from public.agent_messages where id = p_message_id and role = 'assistant' for update;
  if not found then raise exception 'message_not_found'; end if;
  if m.status <> 'pending' then raise exception 'already_finalized'; end if;

### supabase/migrations/0010_maintenance_storage_health.sql
create or replace function public.expire_stale_generations(p_pending_minutes integer default 15, p_processing_minutes integer default 60)
returns table (generations_expired bigint, messages_expired bigint)
language plpgsql security definer set search_path = public as $$
declare v_g bigint; v_m bigint;
begin
  if p_pending_minutes is null or p_processing_minutes is null or p_pending_minutes < 5 or p_processing_minutes < 15 then raise exception 'invalid_delay'; end if;

### supabase/migrations/20261004_noxia_campaigns.sql
create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','active','paused','completed')),
  creative_url text not null,
  destination_url text not null,
  duration_seconds integer not null default 30
    check (duration_seconds between 5 and 300),
  required_action text not null
    check (required_action in ('follow','subscribe','visit','custom')),
  reward_credits integer not null default 8
    check (reward_credits > 0 and reward_credits <= 1000),
  max_rewarded_completions bigint not null default 1000
    check (max_rewarded_completions > 0),
  rewarded_completions bigint not null default 0
    check (rewarded_completions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

### supabase/migrations/0004_secure_generation_finalize.sql
create function public.finalize_generation(
  p_generation_id uuid, p_status text, p_result jsonb default null, p_credits integer default 0, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.generations%rowtype;
begin
  if p_status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  select * into g from public.generations where id = p_generation_id for update;
  if not found then raise exception 'generation_not_found'; end if;
  if g.status not in ('pending','processing') then raise exception 'already_finalized'; end if;
create function public.consume_credits(p_user_id uuid, p_amount integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  update public.profiles set credits = credits - p_amount where user_id = p_user_id and credits >= p_amount;
  return found;
end; $$;
revoke all on function public.consume_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid, integer) to service_role;


No second credit balance should be introduced. The campaign reward must call the project's existing authoritative ledger transaction.
