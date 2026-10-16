-- DRACULA AI — étape 14 : bucket Supabase Storage pour les images générées (octets renvoyés par Hugging Face). À exécuter APRÈS 0011.
-- Contrôle d'accès :
--   • LECTURE  : bucket PUBLIC. Un fichier se lit par son adresse, qui contient trois UUID aléatoires (<userId>/<generationId>/<uuid>.<ext>) : non devinable, mais
--                quiconque a le lien voit l'image (choix assumé : une URL permanente doit pouvoir être enregistrée dans le résultat de la génération).
--   • ÉCRITURE : AUCUNE politique n'est créée sur storage.objects pour les rôles anon / authenticated → le navigateur ne peut ni envoyer, ni modifier, ni supprimer.
--                Seule la clé serveur (service_role, qui contourne RLS) écrit, après validation des octets (type réel, taille, dimensions).
--   • LIMITES  : 15 Mo par fichier, types png / jpeg / webp uniquement (SVG et HTML refusés par le stockage lui-même, en plus de la validation serveur).
--   • SUPPRESSION : par le serveur seulement — échec de génération, expiration (stored_assets.expires_at) et suppression de compte (tâche de maintenance / removeAllForUser, voir 0010).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dracula-images', 'dracula-images', true, 15728640, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
