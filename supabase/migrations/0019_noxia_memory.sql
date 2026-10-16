-- NOXIA controlled memory: only facts explicitly saved by the user are retained.
create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  conversation_id uuid references public.agent_conversations(id) on delete set null,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_memories_user_agent_idx on public.agent_memories(user_id, agent_id, created_at desc);
create unique index if not exists agent_memories_user_agent_content_uq on public.agent_memories(user_id, agent_id, lower(content));
create trigger agent_memories_updated_at before update on public.agent_memories for each row execute function public.set_updated_at();

alter table public.agent_memories enable row level security;
revoke all on public.agent_memories from anon, authenticated;
grant select, delete on public.agent_memories to authenticated;
create policy "agent_memories_select_own" on public.agent_memories for select to authenticated using (auth.uid() = user_id);
create policy "agent_memories_delete_own" on public.agent_memories for delete to authenticated using (auth.uid() = user_id);

-- Writes stay server-only so a browser cannot manufacture memories for another user.
