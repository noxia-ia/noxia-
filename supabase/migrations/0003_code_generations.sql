-- DRACULA AI — étape 4 : stockage des générations Dracula Code. À exécuter APRÈS 0001 et 0002.
alter table public.generations
  add column if not exists project_type text check (project_type is null or project_type in ('frontend','backend','fullstack','api','database','fix')),
  add column if not exists technology text check (technology is null or technology in ('nextjs','react','html','node','supabase','typescript')),
  add column if not exists result jsonb,
  add column if not exists error_message text,
  add column if not exists completed_at timestamptz;

alter table public.generations add constraint generations_prompt_len check (prompt is null or char_length(prompt) <= 4000);
alter table public.generations add constraint generations_result_size check (result is null or pg_column_size(result) < 2000000);

-- Le client ne peut renseigner que ces colonnes à la création (status/credits_used/result restent serveur).
grant insert (project_type, technology) on public.generations to authenticated;

-- Clôture atomique : les crédits ne sont débités QUE si la génération est marquée « completed ».
create or replace function public.finalize_generation(
  p_generation_id uuid, p_status text, p_result jsonb default null, p_credits integer default 0, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.generations%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  select * into g from public.generations where id = p_generation_id and user_id = auth.uid() for update;
  if not found then raise exception 'generation_not_found'; end if;
  if g.status not in ('pending','processing') then raise exception 'already_finalized'; end if;

  if p_status = 'completed' then
    if coalesce(p_credits,0) < 0 then raise exception 'invalid_credits'; end if;
    if coalesce(p_credits,0) > 0 then
      update public.profiles set credits = credits - p_credits where user_id = auth.uid() and credits >= p_credits;
      if not found then raise exception 'insufficient_credits'; end if;
    end if;
    update public.generations set status = 'completed', result = p_result, credits_used = coalesce(p_credits,0), completed_at = now() where id = g.id;
  else
    update public.generations set status = 'failed', credits_used = 0, error_message = left(p_error, 500), completed_at = now() where id = g.id;
  end if;
end; $$;

revoke execute on function public.finalize_generation(uuid,text,jsonb,integer,text) from public, anon;
grant execute on function public.finalize_generation(uuid,text,jsonb,integer,text) to authenticated;
