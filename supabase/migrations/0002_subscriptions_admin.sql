-- DRACULA AI — étape 3 : abonnements, admin, historique, crédits.
-- À exécuter APRÈS 0001_init.sql. Aucune table existante n'est recréée.

-- 1) Statut « suspended »
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('active','expired','cancelled','pending','suspended'));

-- 2) Historique des changements
create table public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('activate','renew','suspend','expire','credits')),
  old_plan text, new_plan text,
  old_status text, new_status text,
  old_expires_at timestamptz, new_expires_at timestamptz,
  credits_delta integer not null default 0,
  created_at timestamptz not null default now()
);
create index subscription_history_user_idx on public.subscription_history(user_id, created_at desc);
alter table public.subscription_history enable row level security;
revoke all on public.subscription_history from anon, authenticated;
grant select on public.subscription_history to authenticated;
create policy "history_select_own" on public.subscription_history for select to authenticated using (auth.uid() = user_id);
create policy "history_select_admin" on public.subscription_history for select to authenticated using (public.is_admin());

-- 3) Lecture admin (aucune écriture directe : tout passe par les fonctions ci-dessous)
create policy "profiles_select_admin" on public.profiles for select to authenticated using (public.is_admin());
create policy "subscriptions_select_admin" on public.subscriptions for select to authenticated using (public.is_admin());

-- 4) Activation / renouvellement / suspension / expiration (admin uniquement, revérifié en base)
-- Les crédits attribués sont AJOUTÉS à profiles.credits (source de vérité du solde).
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
    if p_plan is null or p_plan not in ('daily','weekly','monthly','annual')
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

-- 5) Crédits
create or replace function public.admin_adjust_credits(p_user_id uuid, p_delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_new integer;
begin
  if not public.is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'invalid_credits'; end if;
  update public.profiles set credits = credits + p_delta where user_id = p_user_id returning credits into v_new; -- check (credits >= 0) bloque le négatif
  if not found then raise exception 'user_not_found'; end if;
  insert into public.subscription_history (user_id, admin_id, action, credits_delta) values (p_user_id, auth.uid(), 'credits', p_delta);
  return v_new;
end; $$;

-- Débit atomique de ses PROPRES crédits (pour les futurs modules IA). Ne peut que réduire le solde.
create or replace function public.consume_credits(p_amount integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  update public.profiles set credits = credits - p_amount where user_id = auth.uid() and credits >= p_amount;
  return found;
end; $$;

revoke execute on function public.admin_update_subscription(uuid,text,text,timestamptz,timestamptz,integer) from public, anon;
revoke execute on function public.admin_adjust_credits(uuid,integer) from public, anon;
revoke execute on function public.consume_credits(integer) from public, anon;
grant execute on function public.admin_update_subscription(uuid,text,text,timestamptz,timestamptz,integer) to authenticated;
grant execute on function public.admin_adjust_credits(uuid,integer) to authenticated;
grant execute on function public.consume_credits(integer) to authenticated;
