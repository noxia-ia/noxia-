-- NOXIA 0022 — atomic generation rate limiting.
-- Replaces the race-prone read-then-count admission check with one server-side
-- atomic slot per user/module/window. This is a request limiter, not a credit ledger.

create table if not exists public.generation_rate_limit_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, module)
);

alter table public.generation_rate_limit_buckets enable row level security;
revoke all on public.generation_rate_limit_buckets from anon, authenticated;

create or replace function public.consume_generation_rate_slot(
  p_module text,
  p_limit integer,
  p_window_seconds integer default 60
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.generation_rate_limit_buckets%rowtype;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_module is null or p_module !~ '^[a-z0-9_-]{1,40}$' then raise exception 'invalid_module'; end if;
  if p_limit is null or p_limit <= 0 or p_limit > 1000 then raise exception 'invalid_rate_limit'; end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then raise exception 'invalid_window'; end if;

  select * into v_row
    from public.generation_rate_limit_buckets
   where user_id = v_user and module = p_module
   for update;

  if not found then
    insert into public.generation_rate_limit_buckets(user_id, module, window_started_at, request_count, updated_at)
    values (v_user, p_module, v_now, 1, v_now);
    return true;
  end if;

  if v_now >= v_row.window_started_at + make_interval(secs => p_window_seconds) then
    update public.generation_rate_limit_buckets
       set window_started_at = v_now, request_count = 1, updated_at = v_now
     where user_id = v_user and module = p_module;
    return true;
  end if;

  if v_row.request_count >= p_limit then
    return false;
  end if;

  update public.generation_rate_limit_buckets
     set request_count = request_count + 1, updated_at = v_now
   where user_id = v_user and module = p_module;
  return true;
end;
$$;

revoke all on function public.consume_generation_rate_slot(text, integer, integer) from public, anon;
grant execute on function public.consume_generation_rate_slot(text, integer, integer) to authenticated;
