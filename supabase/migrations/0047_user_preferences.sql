-- NOXIA Phase 1: real user preferences (theme, notifications, voice, personalization)
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  notifications_enabled boolean not null default true,
  voice_preset text not null default 'nova' check (voice_preset in ('nova','calm','warm','energetic')),
  voice_speed numeric(3,2) not null default 1.00 check (voice_speed between 0.50 and 2.00),
  voice_autoplay boolean not null default true,
  response_style text not null default 'balanced' check (response_style in ('balanced','concise','creative','professional','friendly')),
  memory_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own" on public.user_preferences
for select using (auth.uid() = user_id);

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own" on public.user_preferences
for insert with check (auth.uid() = user_id);

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own" on public.user_preferences
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_preferences_delete_own" on public.user_preferences;
create policy "user_preferences_delete_own" on public.user_preferences
for delete using (auth.uid() = user_id);

create or replace function public.set_user_preferences(
  p_theme text,
  p_notifications_enabled boolean,
  p_voice_preset text,
  p_voice_speed numeric,
  p_voice_autoplay boolean,
  p_response_style text,
  p_memory_enabled boolean
) returns public.user_preferences
language plpgsql
security invoker
set search_path = public
as $$
declare v public.user_preferences;
begin
  if p_theme not in ('dark','light','system') then raise exception 'invalid theme'; end if;
  if p_voice_preset not in ('nova','calm','warm','energetic') then raise exception 'invalid voice preset'; end if;
  if p_response_style not in ('balanced','concise','creative','professional','friendly') then raise exception 'invalid response style'; end if;
  if p_voice_speed < 0.50 or p_voice_speed > 2.00 then raise exception 'invalid voice speed'; end if;

  insert into public.user_preferences
    (user_id, theme, notifications_enabled, voice_preset, voice_speed, voice_autoplay, response_style, memory_enabled, updated_at)
  values
    (auth.uid(), p_theme, p_notifications_enabled, p_voice_preset, p_voice_speed, p_voice_autoplay, p_response_style, p_memory_enabled, now())
  on conflict (user_id) do update set
    theme = excluded.theme,
    notifications_enabled = excluded.notifications_enabled,
    voice_preset = excluded.voice_preset,
    voice_speed = excluded.voice_speed,
    voice_autoplay = excluded.voice_autoplay,
    response_style = excluded.response_style,
    memory_enabled = excluded.memory_enabled,
    updated_at = now()
  returning * into v;
  return v;
end;
$$;

revoke all on function public.set_user_preferences(text,boolean,text,numeric,boolean,text,boolean) from public;
grant execute on function public.set_user_preferences(text,boolean,text,numeric,boolean,text,boolean) to authenticated;
