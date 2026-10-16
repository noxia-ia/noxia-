-- NOXIA 0051 : fenêtres de chat glissantes, avec une durée par plan.
-- À COLLER À LA MAIN dans Supabase SQL Editor, APRÈS 0050. Additive : ne modifie, ne supprime et ne réinitialise AUCUNE donnée existante ;
-- ne touche NI aux fonctions de crédits (consume_credits, réservations, finalisation, remboursements), NI aux prix, NI aux abonnements.
--
-- Fonctionnement : une fenêtre S'OUVRE au premier message de l'utilisateur et dure la durée de son plan (Free 3 h 30, Plus 6 h, Pro 9 h, Ultra 12 h).
-- Elle « glisse » : elle n'est pas calée sur le calendrier ; la fenêtre suivante s'ouvre au premier message envoyé APRÈS l'expiration de la précédente.
-- Plafond de crédits par fenêtre : `max_credits` est NULL partout à la livraison → AUCUNE nouvelle limitation tant que le propriétaire n'a pas fixé de valeur.
-- Course critique : le verrou consultatif par utilisateur (pg_advisory_xact_lock) sérialise les appels simultanés d'un même compte → jamais deux fenêtres ouvertes,
-- jamais de dépassement de plafond par des requêtes parallèles. Seul le serveur (service_role) peut appeler ces fonctions.

create table if not exists public.chat_window_rules (
  plan text primary key check (plan in ('free', 'plus', 'pro', 'ultra')),
  duration_minutes integer not null check (duration_minutes between 1 and 10080),
  max_credits integer check (max_credits is null or max_credits > 0),
  updated_at timestamptz not null default now()
);
insert into public.chat_window_rules (plan, duration_minutes, max_credits) values
  ('free', 210, null), ('plus', 360, null), ('pro', 540, null), ('ultra', 720, null)
on conflict (plan) do nothing; -- ne réécrit jamais une valeur déjà modifiée par l'administrateur

create table if not exists public.chat_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'plus', 'pro', 'ultra')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  credits_used integer not null default 0 check (credits_used >= 0),
  messages_count integer not null default 0 check (messages_count >= 0),
  created_at timestamptz not null default now(),
  check (ends_at > started_at)
);
create index if not exists chat_windows_user_started_idx on public.chat_windows(user_id, started_at desc);

alter table public.chat_window_rules enable row level security;
alter table public.chat_windows enable row level security;
revoke all on public.chat_window_rules, public.chat_windows from anon, authenticated;
grant select on public.chat_window_rules, public.chat_windows to authenticated;
drop policy if exists "chat_window_rules_select" on public.chat_window_rules;
create policy "chat_window_rules_select" on public.chat_window_rules for select to authenticated using (true);
drop policy if exists "chat_windows_select_own" on public.chat_windows;
create policy "chat_windows_select_own" on public.chat_windows for select to authenticated using (auth.uid() = user_id);

-- Entre dans la fenêtre courante (l'ouvre si nécessaire) et y compte `p_cost` crédits. `p_plan` est calculé par le SERVEUR depuis l'abonnement en base.
-- Plan inconnu (anciennes formules à durée) → règle « free ». Renvoie une ligne : allowed, reason, window_id, started_at, ends_at, credits_used, max_credits.
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
  perform pg_advisory_xact_lock(hashtextextended('chat_window:' || p_user_id::text, 0)); -- sérialise les appels simultanés de CE compte
  select * into v_rule from public.chat_window_rules r where r.plan = v_plan;
  if not found then raise exception 'missing_rule'; end if;

  select * into v_win from public.chat_windows w where w.user_id = p_user_id order by w.started_at desc limit 1;
  if not found or v_win.ends_at <= now() then
    insert into public.chat_windows (user_id, plan, started_at, ends_at)
    values (p_user_id, v_plan, now(), now() + make_interval(mins => v_rule.duration_minutes))
    returning * into v_win;
  elsif v_win.plan <> v_plan then
    -- changement de plan en cours de fenêtre : une montée de plan peut ALLONGER la fenêtre ; une descente ne la raccourcit jamais.
    v_ends := greatest(v_win.ends_at, v_win.started_at + make_interval(mins => v_rule.duration_minutes));
    update public.chat_windows set plan = v_plan, ends_at = v_ends where id = v_win.id returning * into v_win;
  end if;

  if v_rule.max_credits is not null and v_win.credits_used + p_cost > v_rule.max_credits then
    return query select false, 'window_cap'::text, v_win.id, v_win.started_at, v_win.ends_at, v_win.credits_used, v_rule.max_credits;
    return;
  end if;
  update public.chat_windows set credits_used = credits_used + p_cost, messages_count = messages_count + 1 where id = v_win.id returning * into v_win;
  return query select true, 'ok'::text, v_win.id, v_win.started_at, v_win.ends_at, v_win.credits_used, v_rule.max_credits;
end; $$;

-- Annule la comptabilisation d'un message qui n'a finalement pas été livré (échec fournisseur, crédits insuffisants…) : synchronisé avec le remboursement existant.
create or replace function public.chat_window_release(p_user_id uuid, p_window_id uuid, p_cost integer)
returns boolean language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_user_id is null or p_window_id is null or p_cost is null or p_cost < 0 then raise exception 'invalid_arguments'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat_window:' || p_user_id::text, 0));
  update public.chat_windows set credits_used = greatest(0, credits_used - p_cost), messages_count = greatest(0, messages_count - 1)
  where id = p_window_id and user_id = p_user_id;
  return found;
end; $$;

revoke all on function public.chat_window_enter(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.chat_window_release(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.chat_window_enter(uuid, text, integer) to service_role;
grant execute on function public.chat_window_release(uuid, uuid, integer) to service_role;
