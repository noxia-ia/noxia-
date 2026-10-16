# Mes créations — `/dashboard/creations`

## Architecture
Page serveur (`page.tsx`) → `fetchCreations()` (`src/lib/creations.ts`) → fonction SQL `list_creations()` (migration 0028) → composant client `CreationsBrowser` (onglets, « Charger plus », suppression avec confirmation). Aucune table ajoutée.

## Sources des créations (données réelles uniquement)
- `generations` : code, image, vidéo, ASMR (vidéo/image) et audio (ASMR de type audio), générations d'agents.
- `agent_conversations` : conversations avec les agents.
- Onglet **Mini-Series** : aucune source n'existe encore → message « bientôt ». Musique : pas de module de génération ; l'onglet « Audio / Musique » ne contient aujourd'hui que l'audio ASMR existant.
- Aucune création de démonstration.

## Sécurité
- L'utilisateur vient toujours de la session (`auth.getUser()` / `auth.uid()`). Aucun `user_id` n'est accepté du navigateur.
- `list_creations()` est SECURITY INVOKER : la RLS s'applique, et chaque requête filtre aussi sur `auth.uid()`. Le fournisseur IA, le job et les codes d'erreur ne sont jamais renvoyés.
- Les URLs de médias sont filtrées : seule la route protégée `/api/media/<image|video|audio>?path=<uuid>/<uuid>/<uuid>.<ext>` est acceptée (aucune URL externe affichée).

## Stockage
Buckets image/vidéo/audio privés (inchangés). Lecture et téléchargement passent par `/api/media/*` : session + propriétaire de `stored_assets`, puis URL signée de 5 min. `&download=1` force `Content-Disposition: attachment` dans l'URL signée. Aucun bucket n'est rendu public.
Correction liée : les images conservées (`/api/media/image?path=…`) étaient rejetées par `parseImageResult` à la relecture ; elles sont maintenant acceptées.

## Pagination
Curseur composite (date, id) validé strictement ; 24 éléments par page (max 60 côté SQL) ; une ligne de plus est lue pour savoir s'il reste une page. Les doublons sont ignorés côté client.

## Suppression
- Conversation : droit DELETE du propriétaire (RLS), messages en cascade.
- Génération : propriété vérifiée avec la session ; refusée si `pending`/`processing` ; fichiers privés supprimés d'abord (`removeAssetsForGeneration`) ; si un fichier ne part pas, la génération est conservée ; puis suppression de la ligne par le serveur. Les crédits déjà consommés ne sont pas remboursés.

## Limites connues
Test SQL PGlite de `list_creations` non écrit/exécuté ; rendu non vérifié visuellement (320–1440 px) ; les générations d'agents n'ont pas de page d'ouverture dédiée (le lien ouvre le module).
