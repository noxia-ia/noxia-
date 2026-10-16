-- DRACULA AI — étape 16 : stockage vidéo sécurisé. À exécuter APRÈS 0012.
-- Les vidéos sont PRIVÉES : aucune lecture publique. Le serveur seul écrit/supprime.
-- La lecture passe par /api/media/video, qui vérifie la session et la propriété de stored_assets,
-- puis délivre une URL signée courte.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dracula-videos', 'dracula-videos', false, 104857600, array['video/mp4', 'video/webm'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Aucune policy de lecture/écriture pour anon/authenticated : le navigateur ne touche jamais directement au bucket.
