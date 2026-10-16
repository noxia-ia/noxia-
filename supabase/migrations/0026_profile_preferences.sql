-- NOXIA AI — 0026 : pays d'origine, langue, devise d'affichage, socle des prix, répartition d'audience (admin).
-- Ne modifie aucune migration existante. profiles.credits et le trigger de crédits restent inchangés.

-- 1) Colonnes de profil. Comptes existants : pays NULL (à renseigner dans Paramètres), langue 'fr', devise 'XOF'.
alter table public.profiles
  add column if not exists country_code text,
  add column if not exists locale text not null default 'fr',
  add column if not exists display_currency text not null default 'XOF';

alter table public.profiles drop constraint if exists profiles_country_code_check;
alter table public.profiles add constraint profiles_country_code_check check (country_code is null or country_code ~ '^[A-Z]{2}$');
alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$');
-- Ajouter une devise plus tard = nouvelle migration qui remplace cette contrainte.
alter table public.profiles drop constraint if exists profiles_display_currency_check;
alter table public.profiles add constraint profiles_display_currency_check check (display_currency in ('XOF','USD','EUR'));

-- 2) Inscription : on conserve EXACTEMENT la logique de 0017 (5 crédits + contrôle d'âge) et on ajoute les préférences.
--    Les valeurs invalides sont ignorées (pas d'échec d'inscription) : pays NULL, langue 'fr', devise 'XOF'.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dob date;
  v_country text := upper(nullif(trim(coalesce(new.raw_user_meta_data->>'country_code', '')), ''));
  v_locale text := lower(nullif(trim(coalesce(new.raw_user_meta_data->>'locale', '')), ''));
  v_currency text := upper(nullif(trim(coalesce(new.raw_user_meta_data->>'display_currency', '')), ''));
begin
  begin v_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date; exception when others then v_dob := null; end;
  if v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01') then v_dob := null; end if;
  if v_dob is not null and date_part('year', age(current_date, v_dob)) < 15 then raise exception 'age_restricted'; end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then v_country := null; end if;
  if v_locale is null or v_locale !~ '^[a-z]{2,3}(-[A-Z]{2})?$' then v_locale := 'fr'; end if;
  if v_currency is null or v_currency not in ('XOF','USD','EUR') then v_currency := 'XOF'; end if;
  insert into public.profiles (user_id, full_name, email, role, credits, date_of_birth, age_verified_at, country_code, locale, display_currency)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email, 'user', 5, v_dob, case when v_dob is not null then now() end, v_country, v_locale, v_currency);
  insert into public.subscriptions (user_id, plan, status, starts_at, credits_total, credits_remaining)
  values (new.id, 'free', 'active', now(), 5, 5);
  return new;
end; $$;

-- 3) Modification des préférences : fonction unique (le client n'a PAS de droit d'écriture direct sur ces colonnes).
--    Règle métier : le pays est déclaré par l'utilisateur et modifiable ; aucune localisation GPS ; seules les valeurs fournies changent.
create or replace function public.set_profile_preferences(
  p_country_code text default null,
  p_locale text default null,
  p_display_currency text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_country text := upper(nullif(trim(coalesce(p_country_code, '')), ''));
  v_locale text := lower(nullif(trim(coalesce(p_locale, '')), ''));
  v_currency text := upper(nullif(trim(coalesce(p_display_currency, '')), ''));
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then raise exception 'invalid_country'; end if;
  if v_locale is not null and v_locale !~ '^[a-z]{2,3}(-[A-Z]{2})?$' then raise exception 'invalid_locale'; end if;
  if v_currency is not null and v_currency not in ('XOF','USD','EUR') then raise exception 'invalid_currency'; end if;
  update public.profiles
     set country_code = coalesce(v_country, country_code),
         locale = coalesce(v_locale, locale),
         display_currency = coalesce(v_currency, display_currency)
   where user_id = v_uid;
  if not found then raise exception 'profile_not_found'; end if;
end; $$;
revoke all on function public.set_profile_preferences(text, text, text) from public, anon;
grant execute on function public.set_profile_preferences(text, text, text) to authenticated;

-- 4) Socle des prix d'abonnement (VIDE : aucun prix n'est inventé). Montant entier en unités mineures + devise.
--    Une seule devise de référence par plan (comptabilité/facturation) ; les autres lignes sont des prix explicites,
--    jamais des conversions automatiques. Lecture pour les utilisateurs connectés ; écriture réservée au serveur (étape Admin à venir).
create table if not exists public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('free','daily','weekly','monthly','annual')),
  currency text not null check (currency in ('XOF','USD','EUR')),
  amount_minor bigint not null check (amount_minor >= 0),
  is_reference boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (plan, currency)
);
create unique index if not exists plan_prices_one_reference_per_plan on public.plan_prices(plan) where is_reference;
alter table public.plan_prices enable row level security;
revoke all on public.plan_prices from anon, authenticated;
grant select on public.plan_prices to authenticated;
create policy "plan_prices_select_active" on public.plan_prices for select to authenticated using (active);

-- 5) Audience agrégée pour l'Admin : aucune donnée individuelle. Dimensions : country | locale | currency.
create or replace function public.admin_audience_breakdown(p_dimension text)
returns table (value text, users bigint, pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_dimension not in ('country','locale','currency') then raise exception 'invalid_dimension'; end if;
  return query
    with base as (
      select case p_dimension
               when 'country' then coalesce(country_code, 'unknown')
               when 'locale' then locale
               else display_currency end as v
        from public.profiles
    ), total as (select count(*)::numeric as n from base)
    select b.v, count(*)::bigint, round(100 * count(*) / nullif((select n from total), 0), 1)
      from base b group by b.v order by count(*) desc, b.v;
end; $$;
revoke all on function public.admin_audience_breakdown(text) from public, anon;
grant execute on function public.admin_audience_breakdown(text) to authenticated;
