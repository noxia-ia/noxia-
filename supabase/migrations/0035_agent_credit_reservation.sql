-- NOXIA: agent conversations must reserve credits before contacting an external provider.
-- Apply after 0006 and the latest credit/security migrations.

alter table public.agent_messages
  add column if not exists credits_reserved integer not null default 0;

alter table public.agent_messages
  drop constraint if exists agent_messages_credits_reserved_check;
alter table public.agent_messages
  add constraint agent_messages_credits_reserved_check check (credits_reserved >= 0);

create or replace function public.create_pending_agent_message_atomic(
  p_conversation_id uuid,
  p_user_id uuid,
  p_provider text,
  p_credits integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_user_id is null or p_conversation_id is null then raise exception 'invalid_request'; end if;
  if p_credits is null or p_credits < 0 then raise exception 'invalid_credits'; end if;
  if not exists (select 1 from public.agent_conversations where id = p_conversation_id and user_id = p_user_id) then raise exception 'conversation_not_found'; end if;
  if p_credits > 0 then
    update public.profiles set credits = credits - p_credits where user_id = p_user_id and credits >= p_credits;
    if not found then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;
  end if;
  insert into public.agent_messages(conversation_id,user_id,role,content,status,provider,credits_reserved)
  values (p_conversation_id,p_user_id,'assistant','', 'pending', p_provider, p_credits)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.create_pending_agent_message_atomic(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.create_pending_agent_message_atomic(uuid,uuid,text,integer) to service_role;

create or replace function public.finalize_agent_message(
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
    if coalesce(p_credits,0) < 0 or coalesce(p_credits,0) > m.credits_reserved then raise exception 'invalid_credits'; end if;
    if m.credits_reserved > coalesce(p_credits,0) then
      update public.profiles set credits = credits + (m.credits_reserved - coalesce(p_credits,0)) where user_id = m.user_id;
    end if;
    update public.agent_messages set status = 'completed', content = left(p_content, 20000), credits_used = coalesce(p_credits,0), credits_reserved = 0 where id = m.id;
    update public.agent_conversations set last_message = left(p_content, 120), last_message_at = now() where id = m.conversation_id;
  else
    if m.credits_reserved > 0 then
      update public.profiles set credits = credits + m.credits_reserved where user_id = m.user_id;
    end if;
    update public.agent_messages set status = 'failed', credits_used = 0, credits_reserved = 0, error_message = left(p_error, 500) where id = m.id;
  end if;
end; $$;
revoke all on function public.finalize_agent_message(uuid,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.finalize_agent_message(uuid,text,text,integer,text) to service_role;
