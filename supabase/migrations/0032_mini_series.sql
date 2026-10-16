-- NOXIA AI — 0032 : Mini-Series / Drama continuity.
-- Adds a private series bible, characters and ordered episodes. Video generations remain
-- in public.generations(module='video') so the existing video pipeline/storage/credits stay authoritative.

create table public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  genre text not null default 'drama' check (char_length(genre) between 1 and 60),
  synopsis text not null default '' check (char_length(synopsis) <= 4000),
  bible text not null default '' check (char_length(bible) <= 12000),
  seasons integer not null default 1 check (seasons between 1 and 20),
  episodes_per_season integer not null default 8 check (episodes_per_season between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title)
);

create table public.series_characters (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 3000),
  traits text not null default '' check (char_length(traits) <= 2000),
  created_at timestamptz not null default now(),
  unique(series_id, name)
);
create index series_characters_series_idx on public.series_characters(series_id);

create table public.series_episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  season_number integer not null check (season_number between 1 and 20),
  episode_number integer not null check (episode_number between 1 and 50),
  title text not null check (char_length(title) between 1 and 160),
  synopsis text not null default '' check (char_length(synopsis) <= 4000),
  continuity_notes text not null default '' check (char_length(continuity_notes) <= 6000),
  generation_id uuid references public.generations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','processing','completed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_id, season_number, episode_number)
);
create index series_episodes_series_idx on public.series_episodes(series_id, season_number, episode_number);

alter table public.series enable row level security;
alter table public.series_characters enable row level security;
alter table public.series_episodes enable row level security;

revoke all on public.series, public.series_characters, public.series_episodes from anon, authenticated;
grant select, insert, update, delete on public.series to authenticated;
grant select, insert, update, delete on public.series_characters to authenticated;
grant select, insert, update, delete on public.series_episodes to authenticated;

create policy series_own on public.series for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy series_characters_own on public.series_characters for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy series_episodes_own on public.series_episodes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_series_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger series_updated_at before update on public.series for each row execute function public.set_series_updated_at();
create trigger series_episodes_updated_at before update on public.series_episodes for each row execute function public.set_series_updated_at();

-- Only the owning user can read the private continuity material through the normal tables.
-- The client cannot create a series for another user because user_id must equal auth.uid().
