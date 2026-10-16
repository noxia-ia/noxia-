# Nouvelle économie de crédits (v2)

## À faire, dans cet ordre
1. **Supabase** → SQL Editor → coller et exécuter `supabase/migrations/0054_credit_economy_v2.sql` (après 0052 et 0053).
2. **Pousser le code** sur GitHub (Netlify redéploie). Si la migration n'est pas encore appliquée, le site reste utilisable : le solde s'affiche sans date, le parrainage affiche « migration à appliquer », les quotas ne s'appliquent pas.
3. **Tester** : créer un compte (12 crédits), un compte avec `/register?ref=CODE` (17 crédits), confirmer l'e-mail du filleul (le parrain passe à +10).

## Ce qui change
| Sujet | Avant | Maintenant |
|---|---|---|
| Crédits de bienvenue | 5 | **12** (**17** avec un code de parrainage valide) |
| Parrain | — | **+10** quand l'e-mail du filleul est confirmé |
| Texte (chat, planification de série) et code | 1 crédit | **0 crédit** + quotas par fenêtre glissante |
| Image | 2 | **4** par génération |
| Audio ASMR | 1 | **5** |
| Voix (synthèse) | 1 / 1000 caractères | **5** par génération |
| Musique | 3 par 15 s | **8** par génération |
| Vidéo (et ASMR vidéo) | 5 par 5 s | **5 s : 15 · 10 s : 25 · 15 s : 32 · 30 s : 50** |
| Packs | Plus 100 / Pro 300 / Ultra 1000 (30 j) | **Starter 3 000 FCFA → 100 · Pro 6 000 → 250 · Max 15 000 → 750** (60 j) |
| Validité | aucune | **60 jours** après attribution ou achat |

## Fichiers
- Nouveau : `supabase/migrations/0054_credit_economy_v2.sql`, `src/lib/credit-status.ts`, `src/lib/credit-expiry.ts`, `src/components/credits/CreditExpiry.tsx`, `src/components/referral/ReferralLink.tsx`, `src/app/dashboard/parrainage/page.tsx`, `tests/credit-economy-v2.test.mjs`.
- Modifiés : `src/lib/generation-costs.ts` (barème), `src/lib/plans.ts` (packs), `src/lib/chat-windows.ts` (quota de code), `src/app/dashboard/code/actions.ts`, `src/app/dashboard/series/*`, `src/app/dashboard/credits/page.tsx` (boutique), `src/app/dashboard/layout.tsx` et `overview/page.tsx` (solde + expiration), `src/app/register/*` et `RegisterForm.tsx` (code de parrainage), navigation (`AppShell`, `Sidebar`, `config.ts`), `src/lib/ai/video/types.ts` + `modules/video/*` (30 s), `modules/music/config.ts`, tests `credit-economics` et `generation-gateway`.

## Comment fonctionne l'expiration
Chaque ajout de crédits (achat, bienvenue, récompense, remboursement, ajustement admin) crée un **lot** valable 60 jours (table `credit_lots`). Un déclencheur sur `profiles.credits` tient les lots à jour, sans toucher aux fonctions de crédits existantes. Les lots qui expirent le plus tôt sont dépensés en premier. Les crédits échus sont retirés à chaque mouvement de solde et à chaque ouverture du dashboard (`credit_status()`), et journalisés dans `credit_expirations`.

## Points à valider (choix par défaut, modifiables)
- **Quotas texte/code** : la table `chat_window_rules` contient maintenant `max_messages` et `max_code` par fenêtre glissante (Free 3 h 30 : 20 messages / 3 codes · Starter 6 h : 50 / 8 · Pro 9 h : 100 / 15 · Max 12 h : 200 / 30). Ces valeurs sont des **valeurs de départ proposées**, à ajuster dans Supabase (`update chat_window_rules set max_messages = …`).
- **« Compte validé »** = adresse e-mail confirmée. Si tu veux plutôt « date de naissance renseignée » ou « première génération », dis-le.
- **Crédits existants** : le solde actuel de chaque utilisateur devient un lot valable 60 jours à partir de l'exécution de la migration.
- **Remboursements** (génération échouée) : recréditent un nouveau lot de 60 jours.
- **Voix** : 5 crédits par synthèse vocale. La transcription (dictée) reste à 1 crédit par 30 s, non précisée dans le cahier des charges.
- **Pièces jointes du chat** (image, PDF, ZIP, RAR) : restent à 2 crédits.
- **Vidéo 30 s** : proposée dans l'interface ; vérifie que le modèle Pollinations choisi (`POLLINATIONS_MODEL_VIDEO`) accepte 30 secondes.
- Les prix USD/EUR inactifs en base (499 / 1199 / 2999) ne correspondent plus aux nouveaux packs ; ils restent inactifs tant que tu ne les modifies pas dans `/admin/pricing`.
