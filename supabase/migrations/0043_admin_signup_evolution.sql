-- NOXIA Phase 1 — évolution des inscriptions pour l'Analytics Admin.
-- Agrégé par jour, sans données utilisateur individuelles.
create or replace function public.admin_signup_evolution(p_days integer default 30)
returns table(day date, signups bigint)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select d::date,
         count(p.id)::bigint
  from generate_series(
    current_date - (v_days - 1),
    current_date,
    interval '1 day'
  ) as gs(d)
  left join public.profiles p
    on p.created_at >= gs.d
   and p.created_at < gs.d + interval '1 day'
  group by d
  order by d;
end;
$$;
revoke all on function public.admin_signup_evolution(integer) from public, anon;
grant execute on function public.admin_signup_evolution(integer) to authenticated;
