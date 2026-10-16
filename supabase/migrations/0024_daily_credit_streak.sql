-- NOXIA AI — 0024 : récompenses de présence quotidienne.
-- Cycle de 7 jours : 3 / 3 / 3 / 5 / 5 / 5 / 6 crédits.
-- Un seul claim par jour. Après le jour 7, le cycle recommence au jour 1.
-- La date de référence est la date UTC du serveur afin d'éviter qu'un client
-- puisse modifier son fuseau pour réclamer plusieurs fois la même journée.

alter table public.reward_events
  drop constraint if exists reward_events_kind_check;
alter table public.reward_events
  add constraint reward_events_kind_check
  check (kind in ('ad_completed','campaign_click','referral','daily_streak'));

create table if not exists public.daily_credit_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  streak_day smallint not null default 0 check (streak_day between 0 and 7),
  last_claim_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_credit_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_date date not null,
  streak_day smallint not null check (streak_day between 1 and 7),
  credits integer not null check (credits between 1 and 10),
  created_at timestamptz not null default now(),
  unique (user_id, claim_date)
);
create index if not exists daily_credit_claims_user_idx
  on public.daily_credit_claims(user_id, claim_date desc);

alter table public.daily_credit_streaks enable row level security;
alter table public.daily_credit_claims enable row level security;
revoke all on public.daily_credit_streaks, public.daily_credit_claims from anon, authenticated;
grant select on public.daily_credit_streaks, public.daily_credit_claims to authenticated;

create policy "daily_credit_streaks_select_own" on public.daily_credit_streaks
  for select to authenticated using (auth.uid() = user_id);
create policy "daily_credit_claims_select_own" on public.daily_credit_claims
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.claim_daily_credit()
returns table (
  claimed boolean,
  already_claimed boolean,
  streak_day smallint,
  credits_granted integer,
  balance integer,
  claim_date date,
  next_streak_day smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := current_date;
  v_previous daily_credit_streaks%rowtype;
  v_day smallint;
  v_reward integer;
  v_inserted_id uuid;
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select * into v_previous
    from public.daily_credit_streaks
   where user_id = v_user_id
   for update;

  if found and v_previous.last_claim_date = v_today then
    select p.credits into v_balance from public.profiles p where p.user_id = v_user_id;
    return query select false, true, v_previous.streak_day, 0, coalesce(v_balance, 0), v_today,
      case when v_previous.streak_day >= 7 then 1 else v_previous.streak_day + 1 end;
    return;
  end if;

  if not found or v_previous.last_claim_date is null or v_previous.last_claim_date < v_today - 1 then
    v_day := 1;
  elsif v_previous.streak_day >= 7 then
    v_day := 1;
  else
    v_day := v_previous.streak_day + 1;
  end if;

  v_reward := case v_day
    when 1 then 3
    when 2 then 3
    when 3 then 3
    when 4 then 5
    when 5 then 5
    when 6 then 5
    when 7 then 6
  end;

  insert into public.daily_credit_claims(user_id, claim_date, streak_day, credits)
  values (v_user_id, v_today, v_day, v_reward)
  on conflict (user_id, claim_date) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select p.credits into v_balance from public.profiles p where p.user_id = v_user_id;
    return query select false, true, v_day, 0, coalesce(v_balance, 0), v_today,
      case when v_day >= 7 then 1 else v_day + 1 end;
    return;
  end if;

  insert into public.daily_credit_streaks(user_id, streak_day, last_claim_date, updated_at)
  values (v_user_id, v_day, v_today, now())
  on conflict (user_id) do update set
    streak_day = excluded.streak_day,
    last_claim_date = excluded.last_claim_date,
    updated_at = now();

  update public.profiles
     set credits = credits + v_reward,
         updated_at = now()
   where user_id = v_user_id
  returning credits into v_balance;

  if not found then
    raise exception 'profile_missing';
  end if;

  insert into public.reward_events(user_id, kind, credits, campaign_id)
  values (v_user_id, 'daily_streak', v_reward, 'daily-streak-' || v_today::text);

  return query select true, false, v_day, v_reward, v_balance, v_today,
    case when v_day >= 7 then 1 else v_day + 1 end;
end;
$$;

revoke all on function public.claim_daily_credit() from public, anon, authenticated;
grant execute on function public.claim_daily_credit() to authenticated;
