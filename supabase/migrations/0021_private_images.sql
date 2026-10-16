-- NOXIA — images privées par défaut.
-- Les fichiers déjà stockés restent dans le même bucket/path ; seule la visibilité change.
-- La lecture passe désormais par /api/media/image après vérification du propriétaire.
update storage.buckets
set public = false
where id = 'dracula-images';
