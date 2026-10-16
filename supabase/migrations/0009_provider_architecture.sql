-- DRACULA AI — étape 10 : architecture multi-provider. À exécuter APRÈS 0008.
-- Nécessaire pour : (1) finalisation idempotente vérifiant fournisseur et job, (2) code d'erreur normalisé, (3) statistiques admin.
-- Rien n'est recréé : generations, profiles, subscriptions et leurs droits (0004) restent inchangés.

-- 1) Code d'erreur normalisé (jamais de détail technique ni de secret).
alter table public.generations add column if not exists error_code text;
alter table public.generations add constraint generations_error_code_check check (error_code is null or error_code in (
  'PROVIDER_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_RATE_LIMIT','PROVIDER_MISCONFIGURED','INVALID_REQUEST','CONTENT_BLOCKED',
  'INSUFFICIENT_CREDITS','AUTH_REQUIRED','AGE_RESTRICTED','ACCOUNT_SUSPENDED','GENERATION_FAILED','RESULT_INVALID','NO_PROVIDER','USER_RATE_LIMITED'));
create index if not exists agent_messages_user_time_idx on public.agent_messages(user_id, created_at desc); -- limitation de débit des messages

-- 2) Finalisation IDEMPOTENTE : statut, fournisseur et identifiant de job vérifiés ; débit atomique, une seule fois.
--    Remplace la version de 0004 (même rôle, paramètres supplémentaires). Exécutable UNIQUEMENT par le serveur.
drop function if exists public.finalize_generation(uuid, text, jsonb, integer, text);
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
  if p_job_id is not null and g.provider_job_id is not null and g.provider_job_id <> p_job_id then raise exception 'job_mismatch'; end if;

  if p_status = 'completed' then
    if p_result is null then raise exception 'missing_result'; end if;
    if coalesce(p_credits,0) < 0 then raise exception 'invalid_credits'; end if;
    if coalesce(p_credits,0) > 0 then
      update public.profiles set credits = credits - p_credits where user_id = g.user_id and credits >= p_credits;
      if not found then raise exception 'insufficient_credits'; end if;
    end if;
    update public.generations set status = 'completed', result = p_result, credits_used = coalesce(p_credits,0), completed_at = now(),
      provider = coalesce(g.provider, p_provider), error_code = null where id = g.id;
  else
    update public.generations set status = 'failed', credits_used = 0, error_message = left(p_error, 500), error_code = p_error_code,
      completed_at = now(), provider = coalesce(g.provider, p_provider) where id = g.id;
  end if;
end; $$;
revoke all on function public.finalize_generation(uuid, text, jsonb, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_generation(uuid, text, jsonb, integer, text, text, text, text) to service_role;

-- 3) Statistiques fournisseurs (admin uniquement, revérifié en base). Agrégats seulement : aucun prompt, aucune clé.
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
    select 'agents', coalesce(m.provider, '—'),
      count(*) filter (where m.status = 'completed'), count(*) filter (where m.status = 'failed'), 0::bigint, 0::bigint,
      coalesce(sum(m.credits_used) filter (where m.status = 'completed'), 0)::bigint
    from public.agent_messages m where m.role = 'assistant' and m.created_at >= p_since group by coalesce(m.provider, '—')
    order by 1, 2;
end; $$;
revoke all on function public.admin_provider_stats(timestamptz) from public, anon;
grant execute on function public.admin_provider_stats(timestamptz) to authenticated;
