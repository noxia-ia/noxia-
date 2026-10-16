-- NOXIA 0054 : nouvelle économie de crédits.
-- À COLLER À LA MAIN dans Supabase SQL Editor, APRÈS 0053. Additive et rejouable (if not exists / create or replace).
--
--   1. Crédits de bienvenue : 12 (17 avec un code de parrainage valide).
--   2. Parrainage : +5 au filleul à l'inscription ; +10 au parrain quand l'e-mail du filleul est confirmé (« compte validé »).
--   3. Expiration : chaque attribution ou achat de crédits devient un LOT valable 60 jours. Les lots les plus proches de l'expiration sont
--      consommés en premier. Les crédits échus sont retirés automatiquement (à chaque mouvement de solde et à l'ouverture du dashboard).
--      Mécanisme par déclencheur sur profiles.credits : AUCUNE des fonctions de crédits existantes (réservations, récompenses, admin…) n'est modifiée.
--   4. Texte et code : 0 crédit, remplacés par des quotas par fenêtre glissante (messages de chat, générations de code).
--   5. Prix de référence du pack Starter (plan « plus ») : 2 500 → 3 000 FCFA. Pro (6 000) et Max (« ultra », 15 000) inchangés.

-- ───────────────────────── 1) Lots de crédits + expiration ─────────────────────────
create or replace function public.credit_validity() returns interval language sql immutable as $$ select interval '60 days' $$;

create table if not exists public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  remaining integer not null check (remaining >= 0),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (remaining <= amount)
);
create index if not exists credit_lots_user_expiry_idx on public.credit_lots (user_id, expires_at) where remaining > 0;

create table if not exists public.credit_expirations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credits_expired integer not null check (credits_expired > 0),
  created_at timestamptz not null default now()
);
create index if not exists credit_expirations_user_idx on public.credit_expirations (user_id, created_at desc);

alter table public.credit_lots enable row level security;
alter table public.credit_expirations enable row level security;
revoke all on public.credit_lots, public.credit_expirations from anon, authenticated;
grant select on public.credit_lots, public.credit_expirations to authenticated;
drop policy if exists "credit_lots_select_own" on public.credit_lots;
create policy "credit_lots_select_own" on public.credit_lots for select to authenticated using (auth.uid() = user_id);
drop policy if exists "credit_expirations_select_own" on public.credit_expirations;
create policy "credit_expirations_select_own" on public.credit_expirations for select to authenticated using (auth.uid() = user_id);

-- Déclencheur : tout changement de profiles.credits met les lots à jour.
--   hausse (achat, récompense, remboursement, ajustement admin) → nouveau lot valable 60 jours ;
--   baisse (génération, message…) → consomme d'abord les lots qui expirent le plus tôt ;
--   les lots échus sont retirés AVANT le calcul : un solde périmé ne peut jamais être dépensé.
create or replace function public.profiles_credit_lots_biu() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_expired integer; v_delta integer; v_eff_old integer; v_need integer; v_take integer; r record;
begin
  if coalesce(current_setting('noxia.skip_credit_lots', true), '') = '1' then return new; end if;
  v_delta := new.credits - old.credits;
  select coalesce(sum(remaining), 0) into v_expired from public.credit_lots where user_id = new.user_id and remaining > 0 and expires_at <= now();
  if v_expired > 0 then
    update public.credit_lots set remaining = 0 where user_id = new.user_id and remaining > 0 and expires_at <= now();
    insert into public.credit_expirations (user_id, credits_expired) values (new.user_id, v_expired);
  end if;
  v_eff_old := greatest(old.credits - v_expired, 0);
  if v_delta > 0 then
    insert into public.credit_lots (user_id, amount, remaining, expires_at) values (new.user_id, v_delta, v_delta, now() + public.credit_validity());
    new.credits := v_eff_old + v_delta;
  elsif v_delta < 0 then
    if v_eff_old + v_delta < 0 then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;
    v_need := -v_delta;
    for r in select id, remaining from public.credit_lots where user_id = new.user_id and remaining > 0 order by expires_at asc, granted_at asc for update loop
      exit when v_need <= 0;
      v_take := least(r.remaining, v_need);
      update public.credit_lots set remaining = remaining - v_take where id = r.id;
      v_need := v_need - v_take;
    end loop;
    new.credits := v_eff_old + v_delta;
  end if;
  return new;
end; $$;
drop trigger if exists profiles_credit_lots on public.profiles;
create trigger profiles_credit_lots before update of credits on public.profiles
  for each row when (new.credits is distinct from old.credits) execute function public.profiles_credit_lots_biu();

-- Crédits d'un profil créé directement avec un solde (inscription) → premier lot.
create or replace function public.profiles_initial_lot_ai() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.credits > 0 then
    insert into public.credit_lots (user_id, amount, remaining, expires_at) values (new.user_id, new.credits, new.credits, now() + public.credit_validity());
  end if;
  return new;
end; $$;
drop trigger if exists profiles_initial_lot on public.profiles;
create trigger profiles_initial_lot after insert on public.profiles for each row execute function public.profiles_initial_lot_ai();

-- Reprise de l'existant : le solde actuel de chaque utilisateur devient un lot valable 60 jours à partir d'aujourd'hui (une seule fois).
insert into public.credit_lots (user_id, amount, remaining, expires_at)
select p.user_id, p.credits, p.credits, now() + public.credit_validity()
from public.profiles p
where p.credits > 0 and not exists (select 1 from public.credit_lots l where l.user_id = p.user_id);

-- Retire les crédits échus d'un utilisateur (idempotent). Renvoie le nombre de crédits expirés.
create or replace function public.expire_user_credits(p_user_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_expired integer;
begin
  perform 1 from public.profiles where user_id = p_user_id for update;
  if not found then return 0; end if;
  select coalesce(sum(remaining), 0) into v_expired from public.credit_lots where user_id = p_user_id and remaining > 0 and expires_at <= now();
  if v_expired = 0 then return 0; end if;
  perform set_config('noxia.skip_credit_lots', '1', true);
  update public.credit_lots set remaining = 0 where user_id = p_user_id and remaining > 0 and expires_at <= now();
  update public.profiles set credits = greatest(credits - v_expired, 0) where user_id = p_user_id;
  perform set_config('noxia.skip_credit_lots', '', true);
  insert into public.credit_expirations (user_id, credits_expired) values (p_user_id, v_expired);
  return v_expired;
end; $$;
revoke all on function public.expire_user_credits(uuid) from public, anon, authenticated;
grant execute on function public.expire_user_credits(uuid) to service_role;

-- Solde + prochaine expiration pour le dashboard (appelée avec la session de l'utilisateur).
create or replace function public.credit_status()
returns table (balance integer, next_expires_at timestamptz, next_expiring_credits integer, expired_now integer)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_expired integer; v_next timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  v_expired := public.expire_user_credits(v_uid);
  select min(expires_at) into v_next from public.credit_lots where user_id = v_uid and remaining > 0;
  return query select
    coalesce((select credits from public.profiles where user_id = v_uid), 0),
    v_next,
    coalesce((select sum(remaining)::integer from public.credit_lots where user_id = v_uid and remaining > 0 and v_next is not null and expires_at <= v_next + interval '1 day'), 0),
    v_expired;
end; $$;
revoke all on function public.credit_status() from public, anon;
grant execute on function public.credit_status() to authenticated;

-- ───────────────────────── 2) Parrainage ─────────────────────────
create or replace function public.gen_referral_code() returns text language sql volatile as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
$$;
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
update public.profiles set referral_code = public.gen_referral_code() where referral_code is null;
alter table public.profiles alter column referral_code set default public.gen_referral_code();
alter table public.profiles alter column referral_code set not null;
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referee_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'validated')),
  referee_bonus integer not null default 5 check (referee_bonus >= 0),
  referrer_bonus integer not null default 10 check (referrer_bonus >= 0),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  check (referrer_id <> referee_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated; -- lecture uniquement via my_referral_summary() (noms masqués)

-- Inscription : 12 crédits ; +5 si le code de parrainage (metadata « ref ») correspond à un autre compte. Reprend la version 0026 + parrainage.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dob date;
  v_country text := upper(nullif(trim(coalesce(new.raw_user_meta_data->>'country_code', '')), ''));
  v_locale text := lower(nullif(trim(coalesce(new.raw_user_meta_data->>'locale', '')), ''));
  v_currency text := upper(nullif(trim(coalesce(new.raw_user_meta_data->>'display_currency', '')), ''));
  v_ref text := upper(regexp_replace(coalesce(new.raw_user_meta_data->>'ref', ''), '[^A-Za-z0-9]', '', 'g'));
  v_referrer uuid;
  v_credits integer := 12;
begin
  begin v_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date; exception when others then v_dob := null; end;
  if v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01') then v_dob := null; end if;
  if v_dob is not null and date_part('year', age(current_date, v_dob)) < 15 then raise exception 'age_restricted'; end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then v_country := null; end if;
  if v_locale is null or v_locale !~ '^[a-z]{2,3}(-[A-Z]{2})?$' then v_locale := 'fr'; end if;
  if v_currency is null or v_currency not in ('XOF','USD','EUR') then v_currency := 'XOF'; end if;
  if length(v_ref) between 4 and 16 then
    select user_id into v_referrer from public.profiles where referral_code = v_ref;
    if v_referrer is not null then v_credits := v_credits + 5; end if;
  end if;
  insert into public.profiles (user_id, full_name, email, role, credits, date_of_birth, age_verified_at, country_code, locale, display_currency, referred_by)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email, 'user', v_credits, v_dob, case when v_dob is not null then now() end, v_country, v_locale, v_currency, v_referrer);
  insert into public.subscriptions (user_id, plan, status, starts_at, credits_total, credits_remaining)
  values (new.id, 'free', 'active', now(), v_credits, v_credits);
  if v_referrer is not null then
    insert into public.referrals (referrer_id, referee_id) values (v_referrer, new.id) on conflict (referee_id) do nothing;
  end if;
  return new;
end; $$;

-- « Compte validé » = adresse e-mail confirmée. Le parrain reçoit alors +10 (une seule fois par filleul).
create or replace function public.validate_referral(p_referee uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.referrals%rowtype;
begin
  update public.referrals set status = 'validated', validated_at = now() where referee_id = p_referee and status = 'pending' returning * into r;
  if found and r.referrer_bonus > 0 then
    update public.profiles set credits = credits + r.referrer_bonus where user_id = r.referrer_id;
  end if;
end; $$;
revoke all on function public.validate_referral(uuid) from public, anon, authenticated;

create or replace function public.on_auth_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null then perform public.validate_referral(new.id); end if;
  return new;
end; $$;
drop trigger if exists on_auth_user_referral_validate on auth.users;
create trigger on_auth_user_referral_validate after insert or update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null) execute function public.on_auth_user_confirmed();

-- Récapitulatif pour l'onglet « Parrainage » (noms masqués : aucune donnée personnelle du filleul n'est exposée).
create or replace function public.my_referral_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text; v_items jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select referral_code into v_code from public.profiles where user_id = v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('label', left(coalesce(nullif(trim(p.full_name), ''), 'Ami'), 1) || '•••', 'status', r.status, 'created_at', r.created_at, 'bonus', r.referrer_bonus) order by r.created_at desc), '[]'::jsonb)
    into v_items from (select * from public.referrals where referrer_id = v_uid order by created_at desc limit 50) r
    left join public.profiles p on p.user_id = r.referee_id;
  return jsonb_build_object(
    'code', v_code,
    'invited', (select count(*) from public.referrals where referrer_id = v_uid),
    'validated', (select count(*) from public.referrals where referrer_id = v_uid and status = 'validated'),
    'pending', (select count(*) from public.referrals where referrer_id = v_uid and status = 'pending'),
    'earned', (select coalesce(sum(referrer_bonus), 0) from public.referrals where referrer_id = v_uid and status = 'validated'),
    'items', v_items);
end; $$;
revoke all on function public.my_referral_summary() from public, anon;
grant execute on function public.my_referral_summary() to authenticated;

-- ───────────────────────── 3) Quotas texte et code (0 crédit) ─────────────────────────
-- Fenêtre glissante existante (0051) : on lui ajoute un plafond de messages de chat et de générations de code. Valeurs de départ MODIFIABLES
-- par l'administrateur (table chat_window_rules) : Free 20 messages / 3 codes · Starter 50 / 8 · Pro 100 / 15 · Max 200 / 30 par fenêtre.
alter table public.chat_window_rules add column if not exists max_messages integer check (max_messages is null or max_messages > 0);
alter table public.chat_window_rules add column if not exists max_code integer check (max_code is null or max_code > 0);
alter table public.chat_windows add column if not exists code_count integer not null default 0 check (code_count >= 0);
update public.chat_window_rules set max_messages = 20,  max_code = 3  where plan = 'free'  and max_messages is null and max_code is null;
update public.chat_window_rules set max_messages = 50,  max_code = 8  where plan = 'plus'  and max_messages is null and max_code is null;
update public.chat_window_rules set max_messages = 100, max_code = 15 where plan = 'pro'   and max_messages is null and max_code is null;
update public.chat_window_rules set max_messages = 200, max_code = 30 where plan = 'ultra' and max_messages is null and max_code is null;

-- Chat : même fonction qu'en 0051 + plafond de messages (reason « window_cap »).
create or replace function public.chat_window_enter(p_user_id uuid, p_plan text, p_cost integer)
returns table (allowed boolean, reason text, window_id uuid, started_at timestamptz, ends_at timestamptz, credits_used integer, max_credits integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_plan text := case when p_plan in ('free', 'plus', 'pro', 'ultra') then p_plan else 'free' end;
  v_rule public.chat_window_rules%rowtype;
  v_win public.chat_windows%rowtype;
  v_ends timestamptz;
begin
  if p_user_id is null or p_cost is null or p_cost < 0 then raise exception 'invalid_arguments'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat_window:' || p_user_id::text, 0));
  select * into v_rule from public.chat_window_rules r where r.plan = v_plan;
  if not found then raise exception 'missing_rule'; end if;
  select * into v_win from public.chat_windows w where w.user_id = p_user_id order by w.started_at desc limit 1;
  if not found or v_win.ends_at <= now() then
    insert into public.chat_windows (user_id, plan, started_at, ends_at) values (p_user_id, v_plan, now(), now() + make_interval(mins => v_rule.duration_minutes)) returning * into v_win;
  elsif v_win.plan <> v_plan then
    v_ends := greatest(v_win.ends_at, v_win.started_at + make_interval(mins => v_rule.duration_minutes));
    update public.chat_windows set plan = v_plan, ends_at = v_ends where id = v_win.id returning * into v_win;
  end if;
  if (v_rule.max_credits is not null and v_win.credits_used + p_cost > v_rule.max_credits)
     or (v_rule.max_messages is not null and v_win.messages_count + 1 > v_rule.max_messages) then
    return query select false, 'window_cap'::text, v_win.id, v_win.started_at, v_win.ends_at, v_win.credits_used, v_rule.max_credits;
    return;
  end if;
  update public.chat_windows set credits_used = credits_used + p_cost, messages_count = messages_count + 1 where id = v_win.id returning * into v_win;
  return query select true, 'ok'::text, v_win.id, v_win.started_at, v_win.ends_at, v_win.credits_used, v_rule.max_credits;
end; $$;

-- Code : quota de générations par fenêtre (même fenêtre que le chat).
create or replace function public.code_quota_enter(p_user_id uuid, p_plan text)
returns table (allowed boolean, window_id uuid, ends_at timestamptz, code_count integer, max_code integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_plan text := case when p_plan in ('free', 'plus', 'pro', 'ultra') then p_plan else 'free' end;
  v_rule public.chat_window_rules%rowtype;
  v_win public.chat_windows%rowtype;
  v_ends timestamptz;
begin
  if p_user_id is null then raise exception 'invalid_arguments'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat_window:' || p_user_id::text, 0));
  select * into v_rule from public.chat_window_rules r where r.plan = v_plan;
  if not found then raise exception 'missing_rule'; end if;
  select * into v_win from public.chat_windows w where w.user_id = p_user_id order by w.started_at desc limit 1;
  if not found or v_win.ends_at <= now() then
    insert into public.chat_windows (user_id, plan, started_at, ends_at) values (p_user_id, v_plan, now(), now() + make_interval(mins => v_rule.duration_minutes)) returning * into v_win;
  elsif v_win.plan <> v_plan then
    v_ends := greatest(v_win.ends_at, v_win.started_at + make_interval(mins => v_rule.duration_minutes));
    update public.chat_windows set plan = v_plan, ends_at = v_ends where id = v_win.id returning * into v_win;
  end if;
  if v_rule.max_code is not null and v_win.code_count + 1 > v_rule.max_code then
    return query select false, v_win.id, v_win.ends_at, v_win.code_count, v_rule.max_code;
    return;
  end if;
  update public.chat_windows set code_count = code_count + 1 where id = v_win.id returning * into v_win;
  return query select true, v_win.id, v_win.ends_at, v_win.code_count, v_rule.max_code;
end; $$;

create or replace function public.code_quota_release(p_user_id uuid, p_window_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_user_id is null or p_window_id is null then raise exception 'invalid_arguments'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat_window:' || p_user_id::text, 0));
  update public.chat_windows set code_count = greatest(0, code_count - 1) where id = p_window_id and user_id = p_user_id;
  return found;
end; $$;
revoke all on function public.code_quota_enter(uuid, text) from public, anon, authenticated;
revoke all on function public.code_quota_release(uuid, uuid) from public, anon, authenticated;
grant execute on function public.code_quota_enter(uuid, text) to service_role;
grant execute on function public.code_quota_release(uuid, uuid) to service_role;

-- ───────────────────────── 4) Prix du pack Starter ─────────────────────────
do $$
declare v_old bigint;
begin
  select amount_minor into v_old from public.plan_prices where plan = 'plus' and currency = 'XOF';
  if v_old is distinct from 3000 then
    insert into public.plan_prices (plan, currency, amount_minor, is_reference, active, updated_at)
    values ('plus', 'XOF', 3000, true, true, now())
    on conflict (plan, currency) do update set amount_minor = 3000, active = true, updated_at = now();
    insert into public.plan_price_audit (plan, currency, old_amount_minor, new_amount_minor, old_active, new_active, admin_id)
    values ('plus', 'XOF', v_old, 3000, true, true, null);
  end if;
end $$;
