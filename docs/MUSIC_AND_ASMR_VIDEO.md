# NOXIA — Music + ASMR vidéo (étape 6)

## Music

`/dashboard/music` est la nouvelle interface dédiée à la création musicale. Elle valide côté serveur le prompt, le style, l'ambiance, la durée, le format, le BPM, les instruments et le mode instrumental.

Le contrat `MusicProvider` est serveur uniquement. Aucun fournisseur musical n'est enregistré dans cette étape : l'interface affiche explicitement que le moteur musical n'est pas connecté tant qu'un provider réel n'est pas configuré. Aucune génération fictive n'est simulée.

Le coût est centralisé dans `src/modules/music/config.ts` : 1 crédit par tranche de 15 secondes (arrondie vers le haut). Cette valeur est technique/provisoire et devra être validée avant mise en production commerciale.

## ASMR vidéo

Le module ASMR conserve son historique et son système de crédits. Pour `type=video`, le serveur peut sélectionner l'adaptateur interne `fal-video`, qui réutilise le moteur vidéo déjà présent. Ce choix est serveur uniquement et n'est jamais fourni par le navigateur.

Le fournisseur sous-jacent n'est pas affiché dans les pages utilisateur. Le fichier reste privé et passe par le stockage sécurisé existant.

## Mes créations

La migration 0029 autorise le module `music`. La migration 0028 est mise à jour pour exposer la nouvelle catégorie Musique dans la fonction de listing ; en production, si 0028 a déjà été appliquée, il faut une migration supplémentaire plutôt que modifier l'historique SQL. Dans cette livraison, `0029_music_and_asmr_video.sql` porte les nouvelles contraintes et le module, puis la migration 0030 met à jour la fonction de listing pour ajouter la catégorie Musique, sans modifier 0028.

## Tests

`npm run test:music` valide la logique de validation et de coût sans appeler de fournisseur externe.
