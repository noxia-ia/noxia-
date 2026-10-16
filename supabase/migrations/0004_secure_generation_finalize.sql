-- DRACULA AI — étape 5A : sécurisation des générations. À exécuter APRÈS 0001, 0002 et 0003.
-- Principe : un utilisateur connecté peut LIRE ses générations (RLS), mais toute écriture
-- (création, statut, résultat, débit de crédits) est réservée au serveur (rôle service_role).

-- 1) Plus aucune création directe depuis le navigateur.
drop policy if exists "generations_insert_own" on public.generations;
revoke insert on public.generations from authenticated;

-- 2) Clôture d'une génération : appelable UNIQUEMENT par le serveur.
drop function if exists public.finalize_generation(uuid, text, jsonb, integer, text);
create function public.finalize_generation(
  p_generation_id uuid, p_status text, p_result jsonb default null, p_credits integer default 0, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.generations%rowtype;
begin
  if p_status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  select * into g from public.generations where id = p_generation_id for update;
  if not found then raise exception 'generation_not_found'; end if;
  if g.status not in ('pending','processing') then raise exception 'already_finalized'; end if;

  if p_status = 'completed' then
    if p_result is null then raise exception 'missing_result'; end if;
    if coalesce(p_credits,0) < 0 then raise exception 'invalid_credits'; end if;
    if coalesce(p_credits,0) > 0 then -- débit atomique du propriétaire de la génération, seulement à la réussite
      update public.profiles set credits = credits - p_credits where user_id = g.user_id and credits >= p_credits;
      if not found then raise exception 'insufficient_credits'; end if;
    end if;
    update public.generations set status = 'completed', result = p_result, credits_used = coalesce(p_credits,0), completed_at = now() where id = g.id;
  else
    update public.generations set status = 'failed', credits_used = 0, error_message = left(p_error, 500), completed_at = now() where id = g.id;
  end if;
end; $$;
revoke all on function public.finalize_generation(uuid, text, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.finalize_generation(uuid, text, jsonb, integer, text) to service_role;

-- 3) Débit de crédits : serveur uniquement (ancienne version appelable par l'utilisateur supprimée).
drop function if exists public.consume_credits(integer);
create function public.consume_credits(p_user_id uuid, p_amount integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  update public.profiles set credits = credits - p_amount where user_id = p_user_id and credits >= p_amount;
  return found;
end; $$;
revoke all on function public.consume_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid, integer) to service_role;
