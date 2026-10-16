-- NOXIA AI — 0028 : liste paginée de « Mes créations ».
-- Fonction SECURITY INVOKER (par défaut) : la RLS de generations / agent_conversations / agents s'applique à l'appelant,
-- et chaque requête filtre en plus sur auth.uid(). Aucun user_id n'est accepté en paramètre.
-- Aucune table ni colonne ajoutée ; aucune politique modifiée. Le fournisseur IA (generations.provider) n'est JAMAIS renvoyé.
create or replace function public.list_creations(
  p_category text default 'all',
  p_limit integer default 24,
  p_before_at timestamptz default null,
  p_before_id uuid default null
) returns table (
  source text, id uuid, category text, title text, status text, created_at timestamptz,
  media_url text, mime_type text, agent_id uuid, agent_name text, file_count integer
)
language plpgsql stable set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 60));
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if p_category is null or p_category not in ('all','conversation','code','image','video','audio','asmr','series') then
    raise exception 'invalid_category';
  end if;
  if p_category = 'series' then return; end if;
  return query
  with gens as (
    select 'generation'::text as source, g.id,
           case when g.module = 'asmr' and g.params->>'type' = 'audio' then 'audio'
                when g.module = 'agents' then 'conversation'
                else g.module end as category,
           left(coalesce(g.prompt, ''), 140) as title, g.status, g.created_at,
           coalesce(g.result->'images'->0->>'storedUrl', g.result->'asset'->>'storedUrl') as media_url,
           coalesce(g.result->'images'->0->>'mimeType', g.result->'asset'->>'mimeType') as mime_type,
           null::uuid as agent_id, null::text as agent_name,
           case when jsonb_typeof(g.result->'files') = 'array' then jsonb_array_length(g.result->'files') end as file_count
      from public.generations g
     where g.user_id = v_uid
       and (p_before_at is null or (g.created_at, g.id) < (p_before_at, p_before_id))
       and (p_category = 'all'
            or (p_category = 'conversation' and g.module = 'agents')
            or (p_category = 'audio' and g.module = 'asmr' and g.params->>'type' = 'audio')
            or (p_category = 'asmr' and g.module = 'asmr' and coalesce(g.params->>'type', '') <> 'audio')
            or (p_category in ('code','image','video') and g.module = p_category))
     order by g.created_at desc, g.id desc
     limit v_limit + 1
  ), convs as (
    select 'conversation'::text, c.id, 'conversation'::text,
           left(coalesce(nullif(c.title, ''), nullif(c.last_message, ''), ''), 140), 'completed'::text, c.last_message_at,
           null::text, null::text, c.agent_id, a.name, null::integer
      from public.agent_conversations c
      left join public.agents a on a.id = c.agent_id and a.user_id = v_uid
     where c.user_id = v_uid and p_category in ('all','conversation')
       and (p_before_at is null or (c.last_message_at, c.id) < (p_before_at, p_before_id))
     order by c.last_message_at desc, c.id desc
     limit v_limit + 1
  )
  select * from (select * from gens union all select * from convs) u
   order by u.created_at desc, u.id desc
   limit v_limit + 1;
end; $$;
revoke all on function public.list_creations(text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_creations(text, integer, timestamptz, uuid) to authenticated;
