-- NOXIA: instant authoritative credit-balance updates
-- The source of truth remains public.profiles.credits.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- Existing finalize_reward_claim() is the authoritative reward ledger operation:
-- it atomically increments profiles.credits and records reward_events.
