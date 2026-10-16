-- DRACULA AI — étape 12 : générations bloquées, suivi des jobs, fichiers stockés, dernière vérification des fournisseurs.
-- À exécuter APRÈS 0009. Rien n'est supprimé côté données utilisateur ; seule la fonction inutilisée consume_credits(uuid, integer) est retirée.

-- 1) Suivi des jobs asynchrones : dernière interrogation du fournisseur (anti-spam + détection des jobs sans nouvelles).
alter table public.generations add column if not exists last_polled_at timestamptz;
create index if not exists generations_open_idx on public.generations(status, created_at) where status in ('pending', 'processing');
create index if not exists agent_messages_pending_idx on public.agent_messages(created_at) where status = 'pending';

-- 2) Générations bloquées : marquées « failed » SANS crédit débité, SANS faux résultat.
--    pending    : plus vieux que p_pending_minutes (l'appel au fournisseur est forcément terminé, le plus long timeout est 5 min).
--    processing : aucune actualisation (ni création) depuis p_processing_minutes.
--    Messages d'agent « pending » : même délai que pending. La finalisation reste atomique : si un résultat arrive après coup, la base répond already_finalized (pas de débit).
create or replace function public.expire_stale_generations(p_pending_minutes integer default 15, p_processing_minutes integer default 60)
returns table (generations_expired bigint, messages_expired bigint)
language plpgsql security definer set search_path = public as $$
declare v_g bigint; v_m bigint;
begin
  if p_pending_minutes is null or p_processing_minutes is null or p_pending_minutes < 5 or p_processing_minutes < 15 then raise exception 'invalid_delay'; end if;

  with stale as (
    select id from public.generations
    where (status = 'pending' and created_at < now() - make_interval(mins => p_pending_minutes))
       or (status = 'processing' and coalesce(last_polled_at, created_at) < now() - make_interval(mins => p_processing_minutes))
    for update skip locked)
  update public.generations x
     set status = 'failed', credits_used = 0, error_code = 'PROVIDER_TIMEOUT',
         error_message = 'Le service IA a mis trop de temps à répondre. Réessaie.', completed_at = now()
    from stale where x.id = stale.id;
  get diagnostics v_g = row_count;

  with stale as (
    select id from public.agent_messages
    where status = 'pending' and role = 'assistant' and created_at < now() - make_interval(mins => p_pending_minutes)
    for update skip locked)
  update public.agent_messages x
     set status = 'failed', credits_used = 0, error_message = 'Le service IA a mis trop de temps à répondre. Réessaie.'
    from stale where x.id = stale.id;
  get diagnostics v_m = row_count;

  return query select v_g, v_m;
end; $$;
revoke all on function public.expire_stale_generations(integer, integer) from public, anon, authenticated;
grant execute on function public.expire_stale_generations(integer, integer) to service_role;

-- 3) Dernière vérification de santé d'un fournisseur : statut + date SEULEMENT (aucun détail, aucune clé). Serveur uniquement.
create table if not exists public.provider_health_checks (
  module text not null check (module in ('code', 'image', 'video', 'asmr', 'agents')),
  provider_id text not null check (provider_id ~ '^[a-z0-9_-]{1,40}$'),
  status text not null check (status in ('ok', 'configured', 'not_configured', 'disabled', 'error')),
  checked_at timestamptz not null default now(),
  primary key (module, provider_id)
);
alter table public.provider_health_checks enable row level security; -- aucune politique : inaccessible depuis le navigateur
revoke all on public.provider_health_checks from anon, authenticated;
grant select, insert, update on public.provider_health_checks to service_role;

-- 4) Fichiers stockés de façon permanente (architecture ; vide tant qu'aucun stockage n'est branché).
--    Sert à : supprimer les fichiers à la suppression d'un compte, gérer l'expiration, nettoyer les fichiers orphelins.
create table if not exists public.stored_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  storage_provider text not null,
  path text not null unique,
  mime_type text not null,
  bytes integer not null check (bytes > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists stored_assets_user_idx on public.stored_assets(user_id);
create index if not exists stored_assets_expiry_idx on public.stored_assets(expires_at) where expires_at is not null;
alter table public.stored_assets enable row level security;
revoke all on public.stored_assets from anon, authenticated;
grant select, insert, update, delete on public.stored_assets to service_role;

-- Fichiers à supprimer : expirés, ou rattachés (depuis plus d'1 h) à une génération échouée / supprimée / restée ouverte plus d'un jour.
create or replace function public.purgeable_assets(p_limit integer default 200)
returns table (id uuid, storage_provider text, path text)
language sql stable security definer set search_path = public as $$
  select a.id, a.storage_provider, a.path
  from public.stored_assets a left join public.generations g on g.id = a.generation_id
  where (a.expires_at is not null and a.expires_at < now())
     or (a.created_at < now() - interval '1 hour'
         and (g.id is null or g.status = 'failed' or (g.status in ('pending', 'processing') and g.created_at < now() - interval '1 day')))
  order by a.created_at
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function public.purgeable_assets(integer) from public, anon, authenticated;
grant execute on function public.purgeable_assets(integer) to service_role;

-- 5) Nettoyage : ancienne fonction de débit direct (0004), remplacée depuis par la finalisation atomique et jamais appelée par l'application.
drop function if exists public.consume_credits(uuid, integer);
