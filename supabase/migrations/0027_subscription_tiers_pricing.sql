-- NOXIA AI — 0027 : abonnements par niveau (Plus / Pro / Ultra) et prix centralisés dans plan_prices.
-- Ne modifie aucune migration existante. Les plans daily/weekly/monthly/annual sont CONSERVÉS (abonnements existants, activation admin).
-- Devise de référence = FCFA (XOF). Aucun taux de change n'est stocké ni appliqué : un prix USD/EUR est un prix explicite, jamais une conversion.

-- 1) Nouveaux identifiants de plan.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('free','plus','pro','ultra','daily','weekly','monthly','annual'));
alter table public.plan_prices drop constraint if exists plan_prices_plan_check;
alter table public.plan_prices add constraint plan_prices_plan_check
  check (plan in ('free','plus','pro','ultra','daily','weekly','monthly','annual'));
-- La devise de référence est toujours le FCFA.
alter table public.plan_prices drop constraint if exists plan_prices_reference_is_xof;
alter table public.plan_prices add constraint plan_prices_reference_is_xof check (not is_reference or currency = 'XOF');

-- 2) Activation admin : accepte aussi les niveaux (reste admin uniquement, revérifié en base).
create or replace function public.admin_update_subscription(
  p_user_id uuid, p_action text, p_plan text default null,
  p_starts_at timestamptz default null, p_expires_at timestamptz default null, p_credits integer default 0)
returns void language plpgsql security definer set search_path = public as $$
declare o public.subscriptions%rowtype; v public.subscriptions%rowtype; had boolean;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_action not in ('activate','renew','suspend','expire') then raise exception 'invalid_action'; end if;
  if coalesce(p_credits,0) < 0 then raise exception 'invalid_credits'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then raise exception 'user_not_found'; end if;

  select * into o from public.subscriptions where user_id = p_user_id order by created_at desc limit 1 for update;
  had := found;

  if p_action in ('activate','renew') then
    if p_plan is null or p_plan not in ('plus','pro','ultra','daily','weekly','monthly','annual')
       or p_starts_at is null or p_expires_at is null or p_expires_at <= p_starts_at then
      raise exception 'invalid_plan_or_dates';
    end if;
    if had then
      update public.subscriptions set plan = p_plan, status = 'active', starts_at = p_starts_at, expires_at = p_expires_at,
        credits_total = coalesce(p_credits,0), credits_remaining = coalesce(p_credits,0)
      where id = o.id returning * into v;
    else
      insert into public.subscriptions (user_id, plan, status, starts_at, expires_at, credits_total, credits_remaining)
      values (p_user_id, p_plan, 'active', p_starts_at, p_expires_at, coalesce(p_credits,0), coalesce(p_credits,0)) returning * into v;
    end if;
    update public.profiles set credits = credits + coalesce(p_credits,0) where user_id = p_user_id;
  else
    if not had then raise exception 'no_subscription'; end if;
    update public.subscriptions
      set status = case when p_action = 'suspend' then 'suspended' else 'expired' end,
          expires_at = case when p_action = 'expire' then now() else expires_at end
    where id = o.id returning * into v;
  end if;

  insert into public.subscription_history
    (user_id, subscription_id, admin_id, action, old_plan, new_plan, old_status, new_status, old_expires_at, new_expires_at, credits_delta)
  values (p_user_id, v.id, auth.uid(), p_action, case when had then o.plan end, v.plan, case when had then o.status end, v.status,
    case when had then o.expires_at end, v.expires_at, case when p_action in ('activate','renew') then coalesce(p_credits,0) else 0 end);
end; $$;

revoke execute on function public.admin_update_subscription(uuid,text,text,timestamptz,timestamptz,integer) from public, anon;
grant execute on function public.admin_update_subscription(uuid,text,text,timestamptz,timestamptz,integer) to authenticated;

-- 3) Prix officiels de référence (FCFA, validés). Les prix USD/EUR fournis sont enregistrés INACTIFS : ils ne sont ni affichés
--    ni facturés tant que l'Admin ne les a pas validés (admin_set_plan_price). Montants en unités mineures (XOF : 0 décimale ; USD/EUR : centimes).
insert into public.plan_prices (plan, currency, amount_minor, is_reference, active) values
  ('free',  'XOF',      0, true,  true),
  ('plus',  'XOF',   2500, true,  true),
  ('pro',   'XOF',   6000, true,  true),
  ('ultra', 'XOF',  15000, true,  true),
  ('plus',  'USD',    499, false, false),
  ('pro',   'USD',   1199, false, false),
  ('ultra', 'USD',   2999, false, false),
  ('plus',  'EUR',    499, false, false),
  ('pro',   'EUR',   1199, false, false),
  ('ultra', 'EUR',   2999, false, false)
on conflict (plan, currency) do nothing;

-- 4) Les prix ne sont pas secrets : la page publique /pricing lit les prix ACTIFS sans connexion.
grant select on public.plan_prices to anon;
create policy "plan_prices_select_active_anon" on public.plan_prices for select to anon using (active);
create policy "plan_prices_select_admin" on public.plan_prices for select to authenticated using (public.is_admin());

-- 5) Journal des changements de prix (lecture admin uniquement) + fonction de modification (seule voie d'écriture).
create table if not exists public.plan_price_audit (
  id uuid primary key default gen_random_uuid(),
  plan text not null,
  currency text not null,
  old_amount_minor bigint,
  new_amount_minor bigint not null,
  old_active boolean,
  new_active boolean not null,
  admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.plan_price_audit enable row level security;
revoke all on public.plan_price_audit from anon, authenticated;
grant select on public.plan_price_audit to authenticated;
create policy "plan_price_audit_select_admin" on public.plan_price_audit for select to authenticated using (public.is_admin());

create or replace function public.admin_set_plan_price(p_plan text, p_currency text, p_amount_minor bigint, p_active boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare o public.plan_prices%rowtype; had boolean;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_plan is null or p_plan not in ('free','plus','pro','ultra','daily','weekly','monthly','annual') then raise exception 'invalid_plan'; end if;
  if p_currency is null or p_currency not in ('XOF','USD','EUR') then raise exception 'invalid_currency'; end if;
  if p_amount_minor is null or p_amount_minor < 0 or p_amount_minor > 100000000 then raise exception 'invalid_amount'; end if;
  if p_plan = 'free' and p_amount_minor <> 0 then raise exception 'free_plan_must_be_zero'; end if;
  if p_active is null then raise exception 'invalid_active'; end if;

  if p_currency = 'XOF' and not p_active then raise exception 'reference_price_must_stay_active'; end if;
  if p_currency <> 'XOF' and p_active
     and not exists (select 1 from public.plan_prices where plan = p_plan and currency = 'XOF' and is_reference and active) then
    raise exception 'reference_price_required'; -- pas de prix USD/EUR actif sans prix FCFA de référence
  end if;

  select * into o from public.plan_prices where plan = p_plan and currency = p_currency for update;
  had := found;
  insert into public.plan_prices (plan, currency, amount_minor, is_reference, active, updated_at)
  values (p_plan, p_currency, p_amount_minor, p_currency = 'XOF', p_active, now())
  on conflict (plan, currency) do update set amount_minor = excluded.amount_minor, active = excluded.active, updated_at = now();

  insert into public.plan_price_audit (plan, currency, old_amount_minor, new_amount_minor, old_active, new_active, admin_id)
  values (p_plan, p_currency, case when had then o.amount_minor end, p_amount_minor, case when had then o.active end, p_active, auth.uid());
end; $$;
revoke all on function public.admin_set_plan_price(text, text, bigint, boolean) from public, anon;
grant execute on function public.admin_set_plan_price(text, text, bigint, boolean) to authenticated;
