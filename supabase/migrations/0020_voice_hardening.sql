-- NOXIA Voice hardening: server-authorized credit reservation + daily abuse guard.
-- Uses the existing profiles.credits balance as the single source of truth.

create table if not exists public.voice_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('stt','tts')),
  amount integer not null check (amount > 0),
  status text not null default 'reserved' check (status in ('reserved','finalized','released')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index if not exists voice_credit_reservations_user_created_idx
  on public.voice_credit_reservations(user_id, created_at desc);

alter table public.voice_credit_reservations enable row level security;
revoke all on public.voice_credit_reservations from anon, authenticated;
grant select on public.voice_credit_reservations to authenticated;

drop policy if exists "voice_reservations_select_own" on public.voice_credit_reservations;
create policy "voice_reservations_select_own"
  on public.voice_credit_reservations for select to authenticated
  using (auth.uid() = user_id);

-- Reserve credits atomically before calling an external voice provider.
-- The caller can only reserve for the currently authenticated user.
create or replace function public.reserve_voice_credit(p_kind text, p_amount integer, p_daily_limit integer default 60)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_used integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_kind not in ('stt','tts') then raise exception 'invalid_voice_kind'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_daily_limit is null or p_daily_limit <= 0 then raise exception 'invalid_daily_limit'; end if;

  -- Release abandoned reservations older than 10 minutes and return their held credits.
  update public.profiles p
     set credits = p.credits + x.amount
    from (
      select user_id, coalesce(sum(amount), 0)::integer as amount
        from public.voice_credit_reservations
       where user_id = v_user
         and status = 'reserved'
         and created_at < now() - interval '10 minutes'
       group by user_id
    ) x
   where p.user_id = x.user_id;

  update public.voice_credit_reservations r
     set status = 'released', finalized_at = now()
   where r.user_id = v_user
     and r.status = 'reserved'
     and r.created_at < now() - interval '10 minutes';

  -- Daily request guard. It counts finalized/released reservations as usage, while
  -- active reservations also count so concurrent tabs cannot bypass the limit.
  select count(*)::integer into v_used
    from public.voice_credit_reservations
   where user_id = v_user
     and created_at >= date_trunc('day', now());

  if v_used >= p_daily_limit then
    raise exception 'voice_daily_limit' using errcode = 'P0001';
  end if;

  update public.profiles
     set credits = credits - p_amount
   where user_id = v_user
     and credits >= p_amount;
  if not found then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;

  insert into public.voice_credit_reservations(user_id, kind, amount)
  values (v_user, p_kind, p_amount)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.finalize_voice_credit(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update public.voice_credit_reservations
     set status = 'finalized', finalized_at = now()
   where id = p_reservation_id
     and user_id = v_user
     and status = 'reserved';
  return found;
end;
$$;

create or replace function public.release_voice_credit(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_amount integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  select amount into v_amount
    from public.voice_credit_reservations
   where id = p_reservation_id
     and user_id = v_user
     and status = 'reserved'
   for update;

  if not found then return false; end if;

  update public.profiles set credits = credits + v_amount where user_id = v_user;
  update public.voice_credit_reservations
     set status = 'released', finalized_at = now()
   where id = p_reservation_id and user_id = v_user and status = 'reserved';

  return true;
end;
$$;

revoke all on function public.reserve_voice_credit(text, integer, integer) from public, anon;
revoke all on function public.finalize_voice_credit(uuid) from public, anon;
revoke all on function public.release_voice_credit(uuid) from public, anon;
grant execute on function public.reserve_voice_credit(text, integer, integer) to authenticated;
grant execute on function public.finalize_voice_credit(uuid) to authenticated;
grant execute on function public.release_voice_credit(uuid) to authenticated;
