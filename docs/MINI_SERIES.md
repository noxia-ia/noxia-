# NOXIA Mini-Series / Drama

## Continuité

Les séries utilisent une bible privée, des personnages et des épisodes ordonnés. Les épisodes générés réutilisent le pipeline vidéo existant et restent visibles dans Mes créations.

## Planification

La planification d'une saison crée des épisodes brouillons et consomme 2 crédits. Elle ne lance pas automatiquement toutes les vidéos.

## Génération par lots

L'action `generateSeasonBatchAction` avance dans l'ordre narratif et traite au maximum 3 épisodes brouillons par invocation. Si le moteur vidéo renvoie un traitement asynchrone, le lot s'arrête afin de ne pas lancer l'épisode suivant avant que l'épisode courant soit disponible. L'utilisateur peut relancer l'action après l'achèvement.

Cette limite protège les timeouts HTTP et évite une consommation accidentelle de crédits. Une orchestration persistante en arrière-plan pourra remplacer ce mode par lots dans une étape ultérieure, avec une file de jobs durable.
