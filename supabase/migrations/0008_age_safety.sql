-- DRACULA AI — étape 9 : contrôle d'âge (15+) et journal de sécurité. À exécuter APRÈS 0007.
-- ⚠️ À exécuter AVANT de remettre l'application en service : le middleware lit profiles.date_of_birth.

-- 1) Données de profil. profiles garde sa RLS : lecture de son propre profil ; aucune écriture directe de ces colonnes
--    (le droit UPDATE des utilisateurs ne couvre que full_name et avatar_url).
alter table public.profiles add column if not exists date_of_birth date, add column if not exists age_verified_at timestamptz;
alter table public.profiles add constraint profiles_dob_range check (date_of_birth is null or date_of_birth >= date '1900-01-01');

-- 2) Déclaration UNIQUE de la date de naissance (comptes existants). Non modifiable ensuite : pas de nouvel essai possible.
create or replace function public.set_date_of_birth(p_dob date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_dob is null or p_dob > current_date or p_dob < date '1900-01-01' then raise exception 'invalid_date'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'profile_not_found'; end if;
  update public.profiles set date_of_birth = p_dob, age_verified_at = now() where user_id = auth.uid() and date_of_birth is null;
  if not found then raise exception 'already_set'; end if;
end; $$;
revoke all on function public.set_date_of_birth(date) from public, anon;
grant execute on function public.set_date_of_birth(date) to authenticated;

-- 3) Source de vérité de l'âge côté base (utilisée par les politiques RLS).
create or replace function public.is_age_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where user_id = auth.uid() and date_of_birth is not null and date_part('year', age(current_date, date_of_birth)) >= 15);
$$;
revoke all on function public.is_age_ok() from public, anon;
grant execute on function public.is_age_ok() to authenticated;

-- 4) Inscription : un compte dont la date déclarée indique moins de 15 ans est REFUSÉ par la base (même via l'API directe).
--    Sans date (ou date invalide) : profil créé sans date → accès bloqué partout jusqu'à /verify-age.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dob date;
begin
  begin v_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date; exception when others then v_dob := null; end;
  if v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01') then v_dob := null; end if;
  if v_dob is not null and date_part('year', age(current_date, v_dob)) < 15 then raise exception 'age_restricted'; end if;
  insert into public.profiles (user_id, full_name, email, role, credits, date_of_birth, age_verified_at)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''), new.email, 'user', 0, v_dob, case when v_dob is not null then now() end);
  insert into public.subscriptions (user_id, plan, status, starts_at) values (new.id, 'free', 'active', now());
  return new;
end; $$;

-- 5) Défense en profondeur : créer ou modifier un agent exige l'âge requis, même via l'API directe.
drop policy if exists "agents_insert_own" on public.agents;
create policy "agents_insert_own" on public.agents for insert to authenticated with check (auth.uid() = user_id and public.is_age_ok());
drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and public.is_age_ok());

-- 6) Journal minimal des refus de sécurité : AUCUN contenu de prompt, aucune date de naissance. Écriture/lecture serveur uniquement.
create table public.safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('code','asmr','video','image','agents')),
  reason text not null check (reason in ('minor_sexual','real_person_sexual','filter_bypass')),
  created_at timestamptz not null default now()
);
create index safety_events_user_idx on public.safety_events(user_id, created_at desc);
alter table public.safety_events enable row level security; -- aucune politique : inaccessible depuis le navigateur
revoke all on public.safety_events from anon, authenticated;
