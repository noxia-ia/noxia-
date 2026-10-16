-- DRACULA AI — étape 7 : agents IA, conversations et messages. À exécuter APRÈS 0005.
-- (Version complétée : 0006 n'avait pas encore été appliquée.) Aucune clé API / secret dans ces tables.

-- 1) Agents : configuration modifiable par leur propriétaire (RLS).
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  icon text not null default '🤖' check (char_length(icon) between 1 and 8),
  objective text not null default '' check (char_length(objective) <= 300),
  role text not null check (char_length(role) between 2 and 100),
  instructions text not null check (char_length(instructions) between 10 and 4000),
  domain text not null default '' check (char_length(domain) <= 100),
  personality text not null default 'professional' check (personality in ('professional','friendly','direct','creative','expert','educational','minimalist')),
  personality_custom text check (personality_custom is null or char_length(personality_custom) <= 300),
  creativity text not null default 'medium' check (creativity in ('low','medium','high')),
  language text not null default 'fr' check (language ~ '^[a-z]{2}$'),  -- extensible sans migration
  provider text check (provider is null or provider ~ '^[a-z0-9_-]{1,40}$'), -- préférence ; le serveur ne l'applique que si le fournisseur est « sélectionnable »
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agents_user_idx on public.agents(user_id, created_at desc);
create trigger agents_updated_at before update on public.agents for each row execute function public.set_updated_at();

create function public.enforce_agent_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.agents where user_id = new.user_id) >= 20 then raise exception 'agent_limit_reached'; end if;
  return new;
end; $$;
revoke all on function public.enforce_agent_limit() from public, anon, authenticated;
create trigger agents_limit before insert on public.agents for each row execute function public.enforce_agent_limit();

-- 2) Conversations et messages : lecture par le propriétaire, ÉCRITURE RÉSERVÉE AU SERVEUR.
create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 100),
  status text not null default 'active' check (status in ('active','archived')),
  last_message text not null default '' check (char_length(last_message) <= 200),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_conv_user_idx on public.agent_conversations(user_id, last_message_at desc);
create index agent_conv_agent_idx on public.agent_conversations(agent_id, last_message_at desc);
create trigger agent_conv_updated_at before update on public.agent_conversations for each row execute function public.set_updated_at();

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '' check (char_length(content) <= 20000),
  status text not null default 'completed' check (status in ('pending','completed','failed')),
  credits_used integer not null default 0 check (credits_used >= 0),
  error_message text,
  provider text,
  created_at timestamptz not null default now(),
  check (role <> 'user' or char_length(btrim(content)) > 0)
);
create index agent_msg_conv_idx on public.agent_messages(conversation_id, seq);

-- 3) RLS et privilèges
alter table public.agents enable row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;
revoke all on public.agents, public.agent_conversations, public.agent_messages from anon, authenticated;
grant select, delete on public.agents to authenticated;
grant insert (user_id, name, description, icon, objective, role, instructions, domain, personality, personality_custom, creativity, language, provider, status) on public.agents to authenticated;
grant update (name, description, icon, objective, role, instructions, domain, personality, personality_custom, creativity, language, provider, status) on public.agents to authenticated; -- user_id non modifiable
grant select, delete on public.agent_conversations to authenticated; -- suppression de ses propres conversations
grant select on public.agent_messages to authenticated;              -- aucun insert/update : pas de faux message possible

create policy "agents_select_own" on public.agents for select to authenticated using (auth.uid() = user_id);
create policy "agents_insert_own" on public.agents for insert to authenticated with check (auth.uid() = user_id);
create policy "agents_update_own" on public.agents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agents_delete_own" on public.agents for delete to authenticated using (auth.uid() = user_id);
create policy "agent_conv_select_own" on public.agent_conversations for select to authenticated using (auth.uid() = user_id);
create policy "agent_conv_delete_own" on public.agent_conversations for delete to authenticated using (auth.uid() = user_id);
create policy "agent_msg_select_own" on public.agent_messages for select to authenticated using (auth.uid() = user_id);
-- Volontairement AUCUNE politique admin : les conversations privées ne sont pas lisibles par les administrateurs.

-- 4) Clôture d'une réponse d'agent : serveur uniquement. Enregistre la réponse ET débite atomiquement.
create function public.finalize_agent_message(
  p_message_id uuid, p_status text, p_content text default null, p_credits integer default 0, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m public.agent_messages%rowtype;
begin
  if p_status not in ('completed','failed') then raise exception 'invalid_status'; end if;
  select * into m from public.agent_messages where id = p_message_id and role = 'assistant' for update;
  if not found then raise exception 'message_not_found'; end if;
  if m.status <> 'pending' then raise exception 'already_finalized'; end if;

  if p_status = 'completed' then
    if p_content is null or char_length(btrim(p_content)) = 0 then raise exception 'missing_content'; end if;
    if coalesce(p_credits,0) < 0 then raise exception 'invalid_credits'; end if;
    if coalesce(p_credits,0) > 0 then
      update public.profiles set credits = credits - p_credits where user_id = m.user_id and credits >= p_credits;
      if not found then raise exception 'insufficient_credits'; end if;
    end if;
    update public.agent_messages set status = 'completed', content = left(p_content, 20000), credits_used = coalesce(p_credits,0) where id = m.id;
    update public.agent_conversations set last_message = left(p_content, 120), last_message_at = now() where id = m.conversation_id;
  else
    update public.agent_messages set status = 'failed', credits_used = 0, error_message = left(p_error, 500) where id = m.id;
  end if;
end; $$;
revoke all on function public.finalize_agent_message(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.finalize_agent_message(uuid, text, text, integer, text) to service_role;
