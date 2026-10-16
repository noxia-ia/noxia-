-- NOXIA AI — 0046 : bonus quotidien basé sur 24h réelles.
-- Règle : après un claim à T, le prochain claim est disponible à T + 24h.
-- Le streak continue si le claim suivant intervient avant T + 48h ; au-delà,
-- une journée est considérée comme manquée et le cycle repart à J1.
-- Les migrations précédentes restent intactes.

alter table public.daily_credit_streaks
  add column if not exists last_claim_at timestamptz;

alter table public.daily_credit_claims
  add column if not exists claim_at timestamptz;

-- L'ancienne contrainte empêchait deux claims le même jour civil, même après 24h.
alter table public.daily_credit_claims
  drop constraint if exists daily_credit_claims_user_id_claim_date_key;

create index if not exists daily_credit_claims_user_claim_at_idx
  on public.daily_credit_claims(user_id, claim_at desc);

-- Compatibilité des anciennes lignes : leur created_at devient leur instant de claim.
update public.daily_credit_claims
set claim_at = created_at
where claim_at is null;

update public.daily_credit_streaks s
set last_claim_at = (
  select max(c.claim_at)
  from public.daily_credit_claims c
  where c.user_id = s.user_id
)
where s.last_claim_at is null;

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
  v_now timestamptz := now();
  v_claim_date date := current_date;
  v_previous public.daily_credit_streaks%rowtype;
  v_day smallint;
  v_reward integer;
  v_balance integer;
  v_next_available_at timestamptz;
begin
  if v_user_id is null then raise exception 'unauthenticated'; end if;

  select * into v_previous
  from public.daily_credit_streaks
  where user_id = v_user_id
  for update;

  -- Pas de deuxième claim avant 24 heures réelles.
  if found and v_previous.last_claim_at is not null
     and v_now < v_previous.last_claim_at + interval '24 hours' then
    select p.credits into v_balance from public.profiles p where p.user_id = v_user_id;
    return query select false, true, v_previous.streak_day, 0,
      coalesce(v_balance, 0), v_claim_date,
      case when v_previous.streak_day >= 7 then 1 else v_previous.streak_day + 1 end::smallint;
    return;
  end if;

  -- Une période de 48h ou plus depuis le dernier claim signifie qu'une
  -- journée de présence a été manquée : retour à J1.
  if not found or v_previous.last_claim_at is null
     or v_now >= v_previous.last_claim_at + interval '48 hours' then
    v_day := 1;
  elsif v_previous.streak_day >= 7 then
    v_day := 1;
  else
    v_day := v_previous.streak_day + 1;
  end if;

  v_reward := case v_day
    when 1 then 1
    when 2 then 1
    when 3 then 1
    when 4 then 2
    when 5 then 2
    when 6 then 3
    when 7 then 5
  end;

  insert into public.daily_credit_claims(user_id, claim_date, claim_at, streak_day, credits)
  values (v_user_id, v_claim_date, v_now, v_day, v_reward);

  insert into public.daily_credit_streaks(user_id, streak_day, last_claim_date, last_claim_at, updated_at)
  values (v_user_id, v_day, v_claim_date, v_now, v_now)
  on conflict (user_id) do update set
    streak_day = excluded.streak_day,
    last_claim_date = excluded.last_claim_date,
    last_claim_at = excluded.last_claim_at,
    updated_at = v_now;

  update public.profiles
  set credits = credits + v_reward, updated_at = v_now
  where user_id = v_user_id
  returning credits into v_balance;

  if not found then raise exception 'profile_missing'; end if;

  insert into public.reward_events(user_id, kind, credits, campaign_id)
  values (v_user_id, 'daily_streak', v_reward,
    'daily-streak-' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD-HH24-MI-SS-MS'));

  v_next_available_at := v_now + interval '24 hours';

  return query select true, false, v_day, v_reward, v_balance, v_claim_date,
    case when v_day >= 7 then 1 else v_day + 1 end::smallint;
end;
$$;

revoke all on function public.claim_daily_credit() from public, anon, authenticated;
grant execute on function public.claim_daily_credit() to authenticated;
