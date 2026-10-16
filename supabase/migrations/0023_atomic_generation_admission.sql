-- NOXIA 0023 — atomic generation admission.
-- Prevents two concurrent requests for the same user/module from both reaching
-- an expensive provider before one of them is recorded as in-flight.
-- The server-side RPC is the only supported creation path; the browser cannot
-- choose status, credits, provider or result.

create or replace function public.create_generation_atomic(
  p_user_id uuid,
  p_module text,
  p_prompt text default null,
  p_params jsonb default null,
  p_project_type text default null,
  p_technology text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_lock_key bigint;
  v_existing uuid;
begin
  if p_user_id is null then raise exception 'invalid_user'; end if;
  if p_module is null or p_module not in ('code','image','video','asmr') then
    raise exception 'invalid_module';
  end if;
  if p_prompt is not null and length(p_prompt) > 20000 then
    raise exception 'prompt_too_long';
  end if;
  if p_project_type is not null and length(p_project_type) > 100 then
    raise exception 'project_type_too_long';
  end if;
  if p_technology is not null and length(p_technology) > 100 then
    raise exception 'technology_too_long';
  end if;

  -- Stable lock per user/module for the duration of this transaction.
  v_lock_key := hashtextextended(p_user_id::text || ':' || p_module, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select id into v_existing
    from public.generations
   where user_id = p_user_id
     and module = p_module
     and status in ('pending','processing')
     and created_at >= now() - interval '10 minutes'
   order by created_at desc
   limit 1;

  if v_existing is not null then
    raise exception 'generation_in_flight' using errcode = 'P0001';
  end if;

  insert into public.generations(user_id, module, prompt, params, project_type, technology, status)
  values (p_user_id, p_module, p_prompt, p_params, p_project_type, p_technology, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

-- Remove the legacy direct client creation path. Generation creation is now
-- server-only and atomic; SELECT remains available through the existing RLS.
revoke insert on public.generations from anon, authenticated;
drop policy if exists "generations_insert_own" on public.generations;
revoke all on function public.create_generation_atomic(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_generation_atomic(uuid, text, text, jsonb, text, text) to service_role;
