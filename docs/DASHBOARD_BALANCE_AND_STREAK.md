# NOXIA — solde temps réel et bonus quotidien

## Solde

Le Dashboard utilise `LiveCreditBalance` pour afficher `profiles.credits` avec Supabase Realtime. Après une récompense quotidienne, une campagne ou toute autre opération serveur qui modifie le profil, l'affichage peut se mettre à jour sans rechargement complet.

## Bonus quotidien

Le cycle reste : **3 / 3 / 3 / 5 / 5 / 5 / 6 crédits**.

Le Dashboard détermine l'état initial à partir des dates UTC :

- réclamé aujourd'hui → bouton désactivé et prochain jour affiché ;
- dernière réclamation hier → jour suivant ;
- journée manquée ou absence de streak → Jour 1.

La décision finale et l'attribution restent côté serveur dans `claim_daily_credit()`.
