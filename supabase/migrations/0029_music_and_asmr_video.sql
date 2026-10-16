-- NOXIA AI — 0029 : Music + ASMR vidéo.
-- Aucune migration précédente n'est modifiée. Ajoute uniquement le module music et autorise
-- le moteur vidéo existant à traiter le type ASMR video via un adaptateur serveur.

alter table public.generations drop constraint if exists generations_module_check;
alter table public.generations add constraint generations_module_check
  check (module in ('code','asmr','video','agents','image','music'));

create or replace function public.create_generation_atomic(
  p_user_id uuid,
  p_module text,
  p_prompt text default null,
  p_params jsonb default null,
  p_project_type text default null,
  p_technology text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_lock_key bigint; v_existing uuid;
begin
  if p_user_id is null then raise exception 'invalid_user'; end if;
  if p_module is null or p_module not in ('code','image','video','asmr','music') then raise exception 'invalid_module'; end if;
  if p_prompt is not null and length(p_prompt) > 20000 then raise exception 'prompt_too_long'; end if;
  if p_project_type is not null and length(p_project_type) > 100 then raise exception 'project_type_too_long'; end if;
  if p_technology is not null and length(p_technology) > 100 then raise exception 'technology_too_long'; end if;
  v_lock_key := hashtextextended(p_user_id::text || ':' || p_module, 0);
  perform pg_advisory_xact_lock(v_lock_key);
  select id into v_existing from public.generations
   where user_id = p_user_id and module = p_module and status in ('pending','processing')
     and created_at >= now() - interval '10 minutes'
   order by created_at desc limit 1;
  if v_existing is not null then raise exception 'generation_in_flight' using errcode = 'P0001'; end if;
  insert into public.generations(user_id, module, prompt, params, project_type, technology, status)
  values (p_user_id, p_module, p_prompt, p_params, p_project_type, p_technology, 'pending')
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.create_generation_atomic(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_generation_atomic(uuid, text, text, jsonb, text, text) to service_role;

alter table public.safety_events drop constraint if exists safety_events_module_check;
alter table public.safety_events add constraint safety_events_module_check
  check (module in ('code','asmr','video','image','music','agents'));

alter table public.provider_health_checks drop constraint if exists provider_health_checks_module_check;
alter table public.provider_health_checks add constraint provider_health_checks_module_check
  check (module in ('code','image','video','asmr','music','agents'));
