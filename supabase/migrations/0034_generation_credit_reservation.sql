-- NOXIA Phase 1: atomic credit reservation for every generation.
-- Apply after the latest existing generation migrations. No earlier migration is modified.

alter table public.generations
  add column if not exists credits_reserved integer not null default 0;

alter table public.generations
  drop constraint if exists generations_credits_reserved_check;
alter table public.generations
  add constraint generations_credits_reserved_check check (credits_reserved >= 0);

-- Create + reserve in one transaction. A successful call means the credits have
-- already left the user's balance before any external provider is contacted.
create or replace function public.create_generation_atomic(
  p_user_id uuid,
  p_module text,
  p_prompt text default null,
  p_params jsonb default null,
  p_project_type text default null,
  p_technology text default null,
  p_credits integer default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_lock_key bigint;
  v_existing uuid;
begin
  if p_user_id is null then raise exception 'invalid_user'; end if;
  if p_module is null or p_module not in ('code','image','video','asmr','music','agents') then raise exception 'invalid_module'; end if;
  if p_credits is null or p_credits < 0 then raise exception 'invalid_credits'; end if;
  if p_prompt is not null and length(p_prompt) > 20000 then raise exception 'prompt_too_long'; end if;
  if p_project_type is not null and length(p_project_type) > 100 then raise exception 'project_type_too_long'; end if;
  if p_technology is not null and length(p_technology) > 100 then raise exception 'technology_too_long'; end if;

  v_lock_key := hashtextextended(p_user_id::text || ':' || p_module, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select id into v_existing
    from public.generations
   where user_id = p_user_id and module = p_module
     and status in ('pending','processing')
     and created_at >= now() - interval '10 minutes'
   order by created_at desc limit 1;
  if v_existing is not null then raise exception 'generation_in_flight' using errcode = 'P0001'; end if;

  if p_credits > 0 then
    update public.profiles
       set credits = credits - p_credits
     where user_id = p_user_id and credits >= p_credits;
    if not found then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;
  end if;

  insert into public.generations(user_id, module, prompt, params, project_type, technology, status, credits_reserved)
  values (p_user_id, p_module, p_prompt, p_params, p_project_type, p_technology, 'pending', p_credits)
  returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.create_generation_atomic(uuid,text,text,jsonb,text,text,integer) from public, anon, authenticated;
grant execute on function public.create_generation_atomic(uuid,text,text,jsonb,text,text,integer) to service_role;

-- Finalization now settles the reservation instead of debiting again.
create or replace function public.finalize_generation(
  p_generation_id uuid, p_status text, p_result jsonb default null, p_credits integer default 0, p_error text default null,
  p_provider text default null, p_job_id text default null, p_error_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.generations%rowtype;
begin
  if p_status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  select * into g from public.generations where id = p_generation_id for update;
  if not found then raise exception 'generation_not_found'; end if;
  if g.status not in ('pending','processing') then raise exception 'already_finalized'; end if;
  if p_provider is not null and g.provider is not null and g.provider <> p_provider then raise exception 'provider_mismatch'; end if;
  if p_job_id is not null and g.provider_job_id is not null and g.provider_job_id <> p_job_id then raise exception 'job_mismatch'; end if;

  if p_status = 'completed' then
    if p_result is null then raise exception 'missing_result'; end if;
    if coalesce(p_credits,0) < 0 or coalesce(p_credits,0) > g.credits_reserved then raise exception 'invalid_credits'; end if;
    if g.credits_reserved > coalesce(p_credits,0) then
      update public.profiles set credits = credits + (g.credits_reserved - coalesce(p_credits,0)) where user_id = g.user_id;
    end if;
    update public.generations
       set status = 'completed', result = p_result,
           credits_used = coalesce(p_credits,0),
           credits_reserved = 0,
           completed_at = now(), provider = coalesce(g.provider, p_provider), error_code = null
     where id = g.id;
  else
    if g.credits_reserved > 0 then
      update public.profiles set credits = credits + g.credits_reserved where user_id = g.user_id;
    end if;
    update public.generations
       set status = 'failed', credits_used = 0, credits_reserved = 0,
           error_message = left(p_error, 500), error_code = p_error_code,
           completed_at = now(), provider = coalesce(g.provider, p_provider)
     where id = g.id;
  end if;
end; $$;

revoke all on function public.finalize_generation(uuid,text,jsonb,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function public.finalize_generation(uuid,text,jsonb,integer,text,text,text,text) to service_role;
