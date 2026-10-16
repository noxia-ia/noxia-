# NOXIA — Bonus quotidien de crédits

Le bonus de présence quotidienne suit un cycle de 7 jours :

| Jour | Bonus |
|---|---:|
| 1 | +3 crédits |
| 2 | +3 crédits |
| 3 | +3 crédits |
| 4 | +5 crédits |
| 5 | +5 crédits |
| 6 | +5 crédits |
| 7 | +6 crédits |

## Règles

- Un seul claim par date UTC et par utilisateur.
- Le claim est effectué côté serveur via `claim_daily_credit()`.
- Le navigateur ne peut jamais modifier directement `profiles.credits`.
- Le crédit est ajouté atomiquement à `profiles.credits`.
- Chaque attribution est journalisée dans `reward_events` avec `kind = daily_streak`.
- Une journée manquée remet le cycle au jour 1.
- Après le jour 7, le bonus reste à +6 (palier J7) tant que le streak n’est pas cassé (migration 0025).
- Le solde affiché par NOXIA continue d'utiliser `profiles.credits` comme source de vérité.

## Test

```bash
npm run test:daily-streak
```

Deux tests : `tests/db/daily-streak-logic.test.mjs` (logique miroir TypeScript, exécutable sans dépendances) et `tests/db/daily-streak.test.mjs` (SQL réel sur PGlite : migrations complètes, 20 jours de streak, reset, double claim, manipulation client, isolation utilisateurs).
