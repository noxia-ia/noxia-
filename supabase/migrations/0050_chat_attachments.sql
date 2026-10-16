-- NOXIA 0050 : pièces jointes du chat (images et archives ZIP).
-- À COLLER À LA MAIN dans Supabase SQL Editor (comme les migrations précédentes). Ne supprime, ne modifie et ne réinitialise AUCUNE donnée existante.
-- Ne touche ni aux crédits, ni aux abonnements, ni aux prix, ni aux politiques existantes.
-- Principes : bucket PRIVÉ sans aucune politique (seule la clé serveur y accède) ; le navigateur ne peut ni écrire ni modifier la table ;
-- le binaire est supprimé juste après le traitement du message (la ligne ne garde que le nom, le type et la taille).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('noxia-chat-attachments', 'noxia-chat-attachments', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image', 'zip')),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'application/zip')),
  original_name text not null check (char_length(original_name) between 1 and 120),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  storage_path text check (storage_path is null or char_length(storage_path) <= 200),
  message_id uuid references public.agent_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  purged_at timestamptz
);
create index if not exists chat_attachments_user_idx on public.chat_attachments(user_id, created_at desc);
create index if not exists chat_attachments_message_idx on public.chat_attachments(message_id);

alter table public.chat_attachments enable row level security;
revoke all on public.chat_attachments from anon, authenticated;
grant select on public.chat_attachments to authenticated; -- lecture de SES pièces uniquement ; aucune écriture possible depuis le navigateur
drop policy if exists "chat_attachments_select_own" on public.chat_attachments;
create policy "chat_attachments_select_own" on public.chat_attachments for select to authenticated using (auth.uid() = user_id);
