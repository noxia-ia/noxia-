-- NOXIA AI — 0025 : le bonus quotidien reste au palier du jour 7 tant que le streak n'est pas cassé.
-- Remplace uniquement la fonction claim_daily_credit() (0024 n'est pas modifiée).
-- Grille : J1-3 = +3, J4-6 = +5, J7 et suivants = +6.
-- Une seule journée manquée (ou plus) remet le streak au jour 1.

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
      least(v_previous.streak_day + 1, 7)::smallint;
    return;
  end if;

  if not found or v_previous.last_claim_date is null or v_previous.last_claim_date < v_today - 1 then
    v_day := 1;                       -- nouvel utilisateur ou journée(s) manquée(s)
  else
    v_day := least(v_previous.streak_day + 1, 7)::smallint;  -- plateau au jour 7
  end if;

  v_reward := case
    when v_day <= 3 then 3
    when v_day <= 6 then 5
    else 6
  end;

  insert into public.daily_credit_claims(user_id, claim_date, streak_day, credits)
  values (v_user_id, v_today, v_day, v_reward)
  on conflict (user_id, claim_date) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select p.credits into v_balance from public.profiles p where p.user_id = v_user_id;
    return query select false, true, v_day, 0, coalesce(v_balance, 0), v_today,
      least(v_day + 1, 7)::smallint;
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
    least(v_day + 1, 7)::smallint;
end;
$$;

revoke all on function public.claim_daily_credit() from public, anon, authenticated;
grant execute on function public.claim_daily_credit() to authenticated;
