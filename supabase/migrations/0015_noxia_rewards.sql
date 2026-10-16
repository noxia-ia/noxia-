-- NOXIA AI — crédits de découverte
-- À exécuter après les migrations existantes.
-- Objectif : offrir 5 crédits aux nouveaux comptes et aux comptes free encore à 0.
-- Ne touche pas aux comptes qui ont déjà consommé ou reçu des crédits.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, email, role, credits)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email, 'user', 5);
  insert into public.subscriptions (user_id, plan, status, starts_at, credits_total, credits_remaining)
  values (new.id, 'free', 'active', now(), 5, 5);
  return new;
end; $$;

-- Prépare le mécanisme de récompense publicitaire sans l'activer automatiquement.
-- Une future campagne devra appeler une fonction serveur dédiée et journaliser l'action.
create table if not exists public.reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ad_completed','campaign_click','referral')),
  credits integer not null check (credits > 0 and credits <= 10),
  campaign_id text,
  created_at timestamptz not null default now()
);
create index if not exists reward_events_user_idx on public.reward_events(user_id, created_at desc);
alter table public.reward_events enable row level security;
revoke all on public.reward_events from anon, authenticated;
grant select on public.reward_events to authenticated;
create policy "reward_events_select_own" on public.reward_events
  for select to authenticated using (auth.uid() = user_id);
