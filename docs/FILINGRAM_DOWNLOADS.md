# Téléchargements vidéo — Filingram NOXIA

Les vidéos stockées par NOXIA restent privées. La route `/api/media/video` vérifie la session et la propriété de l'asset.

## Règle produit

- **Free** : téléchargement vidéo avec Filingram NOXIA uniquement.
- **Plus / Pro / Ultra actifs** : choix entre avec Filingram et sans Filingram.
- Une formule expirée ou suspendue ne donne pas le droit au téléchargement sans Filingram.
- Aucun droit de téléchargement n'est décidé côté client : le serveur relit l'abonnement.

## Paramètres

- `download=1&filingram=1` : produit une copie MP4 avec le marquage NOXIA AI - Filingram.
- `download=1&filingram=0` : copie originale uniquement si l'abonnement actif est payant.

Le traitement Filingram utilise FFmpeg côté serveur (`FFMPEG_PATH` peut fournir un chemin explicite). Si FFmpeg n'est pas disponible, le téléchargement marqué échoue proprement ; aucune URL privée n'est exposée.

## Interface

Dans `Mes créations` et le résultat vidéo :

- Free voit « Télécharger avec Filingram » et une option « Sans Filingram · Abonnement » qui mène aux abonnements.
- Un plan Plus/Pro/Ultra actif voit les deux choix.

Les liens de téléchargement ne sont proposés que pour les assets vidéo conservés dans le stockage privé NOXIA.
