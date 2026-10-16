# Campagnes récompensées — câblage de bout en bout (étape 1)

Flux (le navigateur affiche, le serveur décide) :

1. `/dashboard/rewards` liste les campagnes actives (RLS) → bouton **Commencer**.
2. `startRewardWatchAction` → RPC `start_reward_watch` : l'heure de départ est enregistrée par la base (conservée si on recharge la page).
3. Compteur affiché (visible seulement si l'onglet est actif). À 0 → `completeRewardWatchAction` → RPC `complete_reward_watch` : **refusé** tant que la durée complète ne s'est pas écoulée selon l'horloge serveur.
4. L'utilisateur ouvre l'URL d'action, puis clique **Vérifier** → `claimRewardAction` :
   visionnage validé ? → vérificateur serveur (`registry.ts`) → `record_reward_action_proof` → `finalize_reward_claim` (ledger) → `profiles.credits += N` une seule fois.
5. Le solde se met à jour en direct (`LiveCreditBalance` + Realtime sur `profiles`).

Admin : `/admin/campaigns` (création en brouillon, statut séparé, audit dans `reward_campaign_audit`).
L'activation d'une plateforme sociale est **refusée** tant qu'aucun vérificateur officiel n'est enregistré dans `src/lib/campaigns/registry.ts`.

## Tester en local (développement)
1. `.env.local` : `NOXIA_INTERNAL_VERIFIER=1`
2. Admin → Campagnes → plateforme **Autre / test interne**, URLs https, durée 5–10 s → Enregistrer → statut `active`.
3. Dashboard → Gagner des crédits → Commencer → attendre → ouvrir l'action → Vérifier → +N crédits, une seule fois.

## Limites connues (étape « anti-abus avancé »)
- Le serveur garantit un temps **écoulé** minimum, pas que la vidéo a réellement été regardée.
- Pas encore de limite quotidienne de crédits par utilisateur ni de limitation de débit sur les actions.
- Aucun adaptateur social officiel : les campagnes TikTok/YouTube/Instagram/Facebook ne peuvent pas être activées.


## 0018 — anti-abus et présence

Le serveur exige maintenant une présence récente de session (`heartbeat_reward_watch`) avant de valider la durée complète. Le client envoie un heartbeat toutes les 5 secondes lorsque la page est visible. La base ignore les heartbeats espacés de moins de 2 secondes.

La finalisation applique aussi un plafond de 20 récompenses de campagnes par utilisateur sur une fenêtre glissante de 24 heures. Ce plafond est indépendant du `max_rewards` de chaque campagne.

Cette couche réduit les abus trivaux mais ne constitue pas une preuve absolue de visionnage humain ; la vérification réelle du visionnage dépendra du lecteur publicitaire/SDK retenu.
