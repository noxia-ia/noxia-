-- DRACULA AI — étape 2 : profils, abonnements, historique + RLS

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','daily','weekly','monthly','annual')),
  status text not null default 'active' check (status in ('active','expired','cancelled','pending')),
  starts_at timestamptz,
  expires_at timestamptz,
  credits_total integer not null default 0 check (credits_total >= 0),
  credits_remaining integer not null default 0 check (credits_remaining >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions(user_id);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('code','asmr','video','agents')),
  prompt text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  credits_used integer not null default 0 check (credits_used >= 0),
  result_url text,
  created_at timestamptz not null default now()
);
create index generations_user_id_idx on public.generations(user_id, created_at desc);

-- updated_at automatique
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

-- Création automatique du profil + abonnement free à l'inscription.
-- role et credits sont FORCÉS côté base : jamais lus depuis le navigateur.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, email, role, credits)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email, 'user', 0);
  insert into public.subscriptions (user_id, plan, status, starts_at)
  values (new.id, 'free', 'active', now());
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Helper pour les futures politiques admin (aucune politique admin pour l'instant).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.generations enable row level security;

-- Privilèges au niveau colonne (défense en profondeur : role/credits/email non modifiables par le client)
revoke all on public.profiles, public.subscriptions, public.generations from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.generations to authenticated;
grant insert (user_id, module, prompt) on public.generations to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subscriptions_select_own" on public.subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "generations_select_own" on public.generations for select to authenticated using (auth.uid() = user_id);
create policy "generations_insert_own" on public.generations for insert to authenticated with check (auth.uid() = user_id);
