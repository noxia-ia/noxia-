-- NOXIA 0056 : statistiques de la bande d'annonces (affichages et clics), visibles UNIQUEMENT par l'administrateur.
-- À COLLER À LA MAIN dans Supabase SQL Editor, APRÈS 0055. Additive et rejouable.
--   • banner_events : une ligne par affichage ou clic. Aucun accès direct depuis le navigateur (RLS sans politique) ; écrite par le serveur seulement.
--   • track_banner_event() : refuse une bande inexistante, inactive ou hors dates ; anti-doublon (1 affichage / 30 min et 1 clic / 10 s par utilisateur et par bande).
--   • admin_banner_stats() : lecture réservée aux administrateurs (is_admin() relu en base, « forbidden » sinon).
create table if not exists public.banner_events (
  id bigint generated always as identity primary key,
  banner_id uuid not null references public.ad_banners(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('impression', 'click')),
  created_at timestamptz not null default now()
);
create index if not exists banner_events_banner_idx on public.banner_events (banner_id, kind, created_at desc);
create index if not exists banner_events_dedupe_idx on public.banner_events (user_id, banner_id, kind, created_at desc);
alter table public.banner_events enable row level security;
revoke all on public.banner_events from anon, authenticated;

create or replace function public.track_banner_event(p_banner_id uuid, p_user_id uuid, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_banner_id is null or p_user_id is null or p_kind not in ('impression', 'click') then return false; end if;
  if not exists (select 1 from public.ad_banners b where b.id = p_banner_id and b.active
                 and (b.starts_at is null or b.starts_at <= now()) and (b.ends_at is null or b.ends_at > now())) then return false; end if;
  if exists (select 1 from public.banner_events e where e.banner_id = p_banner_id and e.user_id = p_user_id and e.kind = p_kind
             and e.created_at > now() - case when p_kind = 'impression' then interval '30 minutes' else interval '10 seconds' end) then return false; end if;
  insert into public.banner_events (banner_id, user_id, kind) values (p_banner_id, p_user_id, p_kind);
  return true;
end; $$;
revoke all on function public.track_banner_event(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.track_banner_event(uuid, uuid, text) to service_role;

create or replace function public.admin_banner_stats(p_days integer default 30)
returns table (banner_id uuid, title text, active boolean, impressions bigint, unique_viewers bigint, clicks bigint, ctr numeric, last_event_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select b.id, b.title, b.active,
      count(e.id) filter (where e.kind = 'impression')::bigint,
      count(distinct e.user_id) filter (where e.kind = 'impression')::bigint,
      count(e.id) filter (where e.kind = 'click')::bigint,
      case when count(e.id) filter (where e.kind = 'impression') > 0
           then round(100.0 * count(e.id) filter (where e.kind = 'click') / count(e.id) filter (where e.kind = 'impression'), 2) else 0 end,
      max(e.created_at)
    from public.ad_banners b
    left join public.banner_events e on e.banner_id = b.id and e.created_at >= now() - make_interval(days => v_days)
    group by b.id, b.title, b.active, b.created_at
    order by b.created_at desc;
end; $$;
revoke all on function public.admin_banner_stats(integer) from public, anon;
grant execute on function public.admin_banner_stats(integer) to authenticated;
