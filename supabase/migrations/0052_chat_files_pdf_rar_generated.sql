-- NOXIA 0052 : analyse PDF / RAR + fichiers générés (ZIP / PDF) par l'IA.
-- À COLLER À LA MAIN dans Supabase SQL Editor. Ne supprime aucune donnée existante.
-- Principes inchangés : buckets PRIVÉS, aucune politique d'écriture navigateur, binaires purgés après usage.

-- 1) Étendre le bucket des pièces jointes (PDF + RAR)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'noxia-chat-attachments',
  'noxia-chat-attachments',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'application/zip', 'application/pdf', 'application/vnd.rar', 'application/x-rar-compressed']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Étendre les contraintes de la table chat_attachments
alter table public.chat_attachments drop constraint if exists chat_attachments_kind_check;
alter table public.chat_attachments add constraint chat_attachments_kind_check
  check (kind in ('image', 'zip', 'pdf', 'rar'));

alter table public.chat_attachments drop constraint if exists chat_attachments_mime_check;
alter table public.chat_attachments add constraint chat_attachments_mime_check
  check (mime in (
    'image/png', 'image/jpeg', 'image/webp',
    'application/zip',
    'application/pdf',
    'application/vnd.rar', 'application/x-rar-compressed'
  ));

-- 3) Bucket privé pour les fichiers générés par l'IA
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'noxia-chat-generated',
  'noxia-chat-generated',
  false,
  4194304,
  array['application/zip', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 4) Table des fichiers générés (métadonnées ; binaire dans le bucket)
create table if not exists public.chat_generated_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('zip', 'pdf')),
  original_name text not null check (char_length(original_name) between 1 and 120),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 4194304),
  storage_path text check (storage_path is null or char_length(storage_path) <= 200),
  message_id uuid references public.agent_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  purged_at timestamptz
);

create index if not exists chat_generated_files_user_idx
  on public.chat_generated_files(user_id, created_at desc);

alter table public.chat_generated_files enable row level security;
revoke all on public.chat_generated_files from anon, authenticated;
grant select on public.chat_generated_files to authenticated;

drop policy if exists "chat_generated_files_select_own" on public.chat_generated_files;
create policy "chat_generated_files_select_own" on public.chat_generated_files
  for select to authenticated using (auth.uid() = user_id);

-- Aucune politique d'écriture storage : seule la clé service_role (admin) écrit/lit les objets.
