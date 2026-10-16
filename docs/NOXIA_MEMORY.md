# NOXIA — mémoire contrôlée

La mémoire NOXIA reste **explicite** : une information n'entre dans `agent_memories` que lorsque l'utilisateur demande de la mémoriser.

## Contexte intelligent

Lors d'une nouvelle réponse, le serveur ne transmet plus systématiquement toutes les mémoires. Il sélectionne un petit sous-ensemble selon les termes du message courant, avec une limite de 8 mémoires et 5 000 caractères.

Ce mécanisme est un classement déterministe de données déjà mémorisées. Il ne crée aucune nouvelle mémoire automatiquement.

## Garanties

- séparation par `user_id` + `agent_id` ;
- suppression utilisateur possible ;
- aucune écriture mémoire depuis le navigateur ;
- contexte explicitement présenté au fournisseur comme mémoire enregistrée par l'utilisateur ;
- plafond de taille avant injection au modèle ;
- test unitaire du classement dans `test:memory`.

## Prochaine évolution

Avant toute mémoire automatique, il faudra définir un consentement explicite, une politique de rétention et un mécanisme de suppression/export. La continuité vocale pourra ensuite réutiliser exactement le même contexte mémoire.
