# Reward security

The client may display progress, but it cannot decide that a reward is earned.

Production order:
1. record campaign/watch session;
2. verify completion server-side;
3. obtain provider evidence for the required social action;
4. verify identity + event freshness + idempotency;
5. call the existing `finalize_reward_claim()` ledger operation;
6. return the authoritative credit balance / let the existing realtime channel update it.

Unsupported or unverifiable actions return zero credits.

### 0018 — présence de visionnage et limite quotidienne

Le serveur conserve désormais `watch_last_heartbeat_at` et `watch_heartbeat_count`.
Le client envoie un heartbeat au maximum toutes les 5 secondes lorsqu'il est visible ; la base
ignore les heartbeats plus rapprochés que 2 secondes. La clôture exige une présence récente
(15 secondes) en plus de la durée minimale serveur.

Cette télémétrie n'est pas une preuve cryptographique que l'humain regarde réellement la vidéo :
un client compromis peut encore appeler les endpoints. La protection contre ce cas dépend du
lecteur publicitaire/SDK et, pour l'action sociale, du vérificateur officiel du fournisseur.

La finalisation applique aussi un plafond de 20 récompenses de campagnes par utilisateur sur 24 h,
en plus du plafond `max_rewards` propre à chaque campagne.

## Atomic generation rate limiting

Les admissions de génération passent désormais par `consume_generation_rate_slot()` (migration 0022). Le compteur est verrouillé côté base par `(user_id,module)`, ce qui évite le contournement par deux requêtes concurrentes qui liraient le même compteur avant de l'incrémenter.
