-- DRACULA AI — étape 17 : stockage audio ASMR sécurisé.
-- Les fichiers audio sont PRIVÉS : le serveur seul écrit/supprime.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dracula-audio', 'dracula-audio', false, 52428800, array['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Aucune policy de lecture/écriture pour anon/authenticated : le navigateur ne touche jamais directement au bucket.
