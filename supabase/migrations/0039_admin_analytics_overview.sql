-- NOXIA Phase 1 — admin analytics overview.
-- Aggregates only; no user-level records are returned.

create or replace function public.admin_analytics_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  with latest_sub as (
    select distinct on (s.user_id) s.user_id, s.plan, s.status, s.expires_at
    from public.subscriptions s
    order by s.user_id, s.created_at desc
  ),
  plan_counts as (
    select jsonb_object_agg(plan, count) as value
    from (
      select plan, count(*)::bigint as count
      from latest_sub
      where status = 'active' and (expires_at is null or expires_at >= now())
      group by plan
    ) x
  ),
  generation_stats as (
    select count(*)::bigint as total,
           count(*) filter (where status='completed')::bigint as completed,
           count(*) filter (where status='failed')::bigint as failed,
           count(*) filter (where status in ('pending','processing'))::bigint as in_flight,
           coalesce(sum(credits_used),0)::bigint as credits_consumed,
           count(*) filter (where created_at >= now() - interval '30 days')::bigint as last_30_days
    from public.generations
  ),
  recent_active as (
    select count(distinct user_id)::bigint as users
    from public.generations
    where created_at >= now() - interval '30 days'
  ),
  reward_stats as (
    select count(*) filter (where kind = 'daily_streak')::bigint as daily_claims,
           coalesce(sum(credits) filter (where kind = 'daily_streak'),0)::bigint as daily_credits
    from public.reward_events
  )
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'new_users_30_days', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'active_users_30_days', (select users from recent_active),
    'plans_active', coalesce((select value from plan_counts), '{}'::jsonb),
    'generations_total', (select total from generation_stats),
    'generations_completed', (select completed from generation_stats),
    'generations_failed', (select failed from generation_stats),
    'generations_in_flight', (select in_flight from generation_stats),
    'generations_30_days', (select last_30_days from generation_stats),
    'credits_consumed', (select credits_consumed from generation_stats),
    'daily_claims', (select daily_claims from reward_stats),
    'daily_credits_distributed', (select daily_credits from reward_stats)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_analytics_overview() from public, anon;
grant execute on function public.admin_analytics_overview() to authenticated;
