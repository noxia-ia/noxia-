-- NOXIA 0055 : bulle de support (réclamations, assistance, partenariats B2B) + tâches de fond des fournisseurs (vidéo asynchrone).
-- À COLLER À LA MAIN dans Supabase SQL Editor, APRÈS 0054. Additive et rejouable.

-- 1) Tickets de support : écrits UNIQUEMENT par le serveur (clé secrète) ; lus par les administrateurs ; jamais lisibles par le public.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('complaint', 'assistance', 'partnership')),
  name text check (name is null or char_length(name) <= 80),
  email text not null check (char_length(email) between 5 and 254),
  company text check (company is null or char_length(company) <= 120),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_email_idx on public.support_tickets (email, created_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;
grant select, update on public.support_tickets to authenticated;
drop policy if exists "support_tickets_admin_select" on public.support_tickets;
create policy "support_tickets_admin_select" on public.support_tickets for select to authenticated using (public.is_admin());
drop policy if exists "support_tickets_admin_update" on public.support_tickets;
create policy "support_tickets_admin_update" on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) Tâches de fond (vidéo Pollinations asynchrone). Une ligne par génération ; écrite par le serveur et par la fonction de fond Netlify (clé secrète).
create table if not exists public.provider_jobs (
  id uuid primary key,                       -- = generations.id
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('video')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  error_code text check (error_code is null or char_length(error_code) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists provider_jobs_user_idx on public.provider_jobs (user_id, created_at desc);
alter table public.provider_jobs enable row level security;
revoke all on public.provider_jobs from anon, authenticated; -- aucune lecture ni écriture depuis le navigateur
