-- NOXIA Phase 1 — align campaign analytics with the definitive watch-only reward rule.
-- Previous migrations remain immutable. Legacy action columns are retained for compatibility.
create or replace function public.admin_campaign_analytics()
returns table (
  id uuid,
  title text,
  platform text,
  status text,
  reward_credits integer,
  max_rewards integer,
  claims bigint,
  verified bigint,
  rewarded bigint,
  credits_awarded bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select c.id, c.title, c.platform, c.status, c.reward_credits, c.max_rewards,
      count(rc.id)::bigint as claims,
      count(rc.id) filter (where rc.watch_verified)::bigint as verified,
      count(rc.id) filter (where rc.rewarded_at is not null)::bigint as rewarded,
      coalesce(sum(rc.credits_awarded), 0)::bigint as credits_awarded
    from public.reward_campaigns c
    left join public.reward_claims rc on rc.campaign_id = c.id
    group by c.id, c.title, c.platform, c.status, c.reward_credits, c.max_rewards
    order by c.created_at desc;
end;
$$;
revoke all on function public.admin_campaign_analytics() from public, anon;
grant execute on function public.admin_campaign_analytics() to authenticated;
