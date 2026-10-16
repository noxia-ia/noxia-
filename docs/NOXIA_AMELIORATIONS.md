# NOXIA — améliorations (audit, Cloudflare, Pollinations, pièces jointes)

Branche de travail : `amelioration-pieces-jointes`. État d'origine conservé : tag Git `sauvegarde-avant-ameliorations` (voir « Retour arrière »).
**Aucun prix, crédit d'abonnement, règle de facturation ni donnée de production n'a été modifié.** Le barème existant est inchangé ; seul le prix d'un message portant une image ou un ZIP a été ajouté (2 crédits, décision du propriétaire).

## 1. Ce qui a été fait

| # | Sujet | Résultat |
|---|---|---|
| 1 | Fusion de vos correctifs | Interface de mise à jour, thème, bandes pub (0049) et correctif du solde (`useId`) fusionnés. **40 fichiers de la mise à jour identiques** ; 5 seulement modifiés ensuite, de façon additive (voir §2). Textes à l'encodage cassé réparés. |
| 2 | Texte (agents) → Cloudflare | Fournisseur `cloudflare` ajouté ; OpenRouter reste en secours. Prompt de sécurité factorisé (comportement OpenRouter inchangé). |
| 3 | Image → Cloudflare | `CloudflareImage` (FLUX schnell) enregistré (il n'était qu'importé). Stockage privé obligatoire. |
| 4 | Voix → Cloudflare | `/api/voice/tts` et `/api/voice/transcribe` n'appellent plus ElevenLabs. Réservation / finalisation / remboursement des crédits **inchangés**. |
| 5 | Vidéo et ASMR vidéo → Pollinations | Fournisseurs `pollinations` et `pollinations-video` ajoutés (octets validés puis rangés en privé). fal.ai reste disponible en secours. |
| 6 | Pièces jointes du chat | Bouton « + » (Image / Projet ZIP), aperçu, nom, type, taille, progression, retrait, erreurs claires. Serveur : envoi authentifié, type par les octets, bucket privé, suppression des binaires après traitement. |
| 7 | Analyse d'images | Image réellement transmise au modèle de vision Cloudflare. Sans modèle de vision configuré : aucun appel, message clair, **aucun crédit débité**. |
| 8 | Analyse de ZIP | Analyseur sécurisé (ZIP Slip, bombes, chiffrés, liens, exécutables, archives imbriquées, secrets masqués, projets volumineux analysés sélectivement). |
| 9 | Prix | 2 crédits pour un message avec image ou ZIP (à la place de 1, jamais cumulés), calculé par le serveur. |
| 10 | Admin | Contrôle serveur vérifié ; SQL de promotion fourni (§6). |

## 2. Fichiers modifiés (liste exacte vs. NOXIA_9)

**Ajoutés** : `src/lib/ai/providers/cloudflare-client.ts`, `…/agents/cloudflare.ts`, `…/agents/shared.ts`, `…/voice/cloudflare-voice.ts`, `…/video/pollinations.ts`, `…/asmr/pollinations-video.ts`, `src/lib/attachments/{zip,sniff,service}.ts`, `src/app/api/chat/attachments/route.ts`, `supabase/migrations/0050_chat_attachments.sql` (+ `0049_ad_banners.sql` de votre mise à jour), `supabase/admin/promouvoir-administrateur.sql`, `tests/provider-harness/cloudflare.mjs`, `tests/attachments-zip.test.mjs`, `tests/attachments-wiring.test.mjs`, ce document ; plus les fichiers de votre mise à jour (`HomeChat`, `chat-actions`, `AppShell`, admin bannières…).
**Modifiés (mes changements)** : `src/lib/providers/register.ts`, `src/lib/ai/providers/agents/openrouter.ts`, `src/lib/ai/agents/types.ts`, `src/lib/ai/video/types.ts`, `src/lib/ai/asmr/types.ts`, `src/lib/generation-costs.ts`, `src/lib/agent-chat.ts`, `src/app/dashboard/agents/actions.ts`, `…/video/actions.ts`, `…/asmr/actions.ts`, `…/series/actions.ts`, `…/settings/actions.ts`, `src/app/api/voice/{tts,transcribe}/route.ts`, `src/app/dashboard/page.tsx`, `src/app/dashboard/chat-actions.ts`, `src/components/chat/HomeChat.tsx`, `src/styles/globals.css` (CSS **ajouté en fin de fichier**), `.env.example`, `package.json`, `tests/credit-economics.test.mjs`.
**Parmi vos fichiers de mise à jour, seuls 5 ont été retouchés** : `HomeChat.tsx` (ajout du bouton « + », aperçu, envoi des ids ; 7 lignes remplacées, rien de supprimé d'autre), `chat-actions.ts` (transmet les ids), `dashboard/page.tsx` (2 props), `series/actions.ts` (2 paramètres serveur), `globals.css` (ajout en fin).

## 3. Variables d'environnement (à créer dans Netlify → Site configuration → Environment variables ; **aucune valeur n'est dans le ZIP**)

| Variable | Rôle |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Accès Workers AI (jeton « Workers AI », identifiant de compte de 32 caractères) |
| `CLOUDFLARE_MODEL_AGENT` | Modèle texte (`@cf/…`). Obligatoire pour le chat Cloudflare. |
| `CLOUDFLARE_MODEL_VISION` | Modèle de vision (`@cf/…`). Vide = analyse d'images désactivée. |
| `CLOUDFLARE_MODEL_TTS` (+ `CLOUDFLARE_VOICE` optionnelle) | Synthèse vocale. Obligatoire pour la voix. |
| `CLOUDFLARE_MODEL_STT` | Optionnel (défaut : `@cf/openai/whisper-large-v3-turbo`). |
| `POLLINATIONS_API_KEY`, `POLLINATIONS_MODEL_VIDEO` | Vidéo et ASMR vidéo |
| `AGENT_PROVIDER=cloudflare`, `AGENT_PROVIDER_FALLBACK=openrouter` | Texte : Cloudflare d'abord, OpenRouter en secours |
| `IMAGE_PROVIDER=cloudflare` (+ `STORAGE_PROVIDER=supabase-storage`) | Image |
| `VIDEO_PROVIDER=pollinations`, `ASMR_PROVIDER=pollinations-video` | Vidéo / ASMR vidéo (fal.ai reste en secours via `…_FALLBACK=fal` / `fal-video`) |
| `CHAT_ATTACHMENTS_ENABLED=true`, `CHAT_ATTACHMENT_MAX_MB=4` | Pièces jointes (activer **après** la migration 0050) |

Les variables existantes (Supabase, ElevenLabs pour ASMR audio, OpenRouter…) restent valables. `ELEVENLABS_VOICE_ID` n'est plus utilisée par la voix.

## 4. Migrations SQL (à coller à la main dans Supabase → SQL Editor ; rien n'est exécuté automatiquement)

1. `0049_ad_banners.sql` (si pas déjà appliquée), puis `0050_chat_attachments.sql`, puis `0051_chat_windows.sql` (§10).
2. 0050 : crée le bucket **privé** `noxia-chat-attachments` et la table `chat_attachments` (RLS : lecture de ses propres lignes seulement, aucune écriture navigateur). Elle ne touche ni aux crédits, ni aux abonnements, ni aux profils, ni aux tables existantes.

## 5. Lancer, tester, déployer

```bash
npm install
npm run test:cloudflare && npm run test:attachments-zip && npm run test:attachments-wiring && npm run test:credit-economics
npm run test:all        # suite complète (voir les échecs connus ci-dessous)
npm run build           # à lancer chez vous : non exécuté dans mon environnement
```
Déploiement : `git push` → Netlify redéploie. Ordre conseillé : (1) migration 0050 ; (2) variables d'environnement ; (3) déploiement ; (4) `CHAT_ATTACHMENTS_ENABLED=true` ; (5) essai avec un compte de test.

## 6. Compte administrateur

**Vérifié dans le code** : l'accès `/admin` exige `profiles.role = 'admin'` relu en base à chaque requête (`requireAdmin`), l'âge vérifié (≥ 15 ans) et une session valide ; les 5 fichiers d'actions admin appellent `requireAdmin`. Le navigateur ne peut pas changer son rôle (aucun droit d'écriture sur `role`).
**Non vérifiable ici** : l'état réel de votre compte en production (je n'ai aucun accès à votre base). Exécutez la requête 1 de `supabase/admin/promouvoir-administrateur.sql`.

**Se connecter en administrateur**
1. Créez un compte normal sur `/register` (e-mail, mot de passe, date de naissance, confirmation d'âge) puis confirmez l'e-mail reçu.
2. Dans Supabase → SQL Editor, exécutez `supabase/admin/promouvoir-administrateur.sql` en remplaçant `VOTRE_EMAIL` (étapes 1 → 2 → 3).
3. Allez sur `/login`, connectez-vous. Dans le menu, **« Centre Admin »** apparaît ; ou ouvrez directement `/admin`.
4. Pages : `/admin` (utilisateurs), `/admin/analytics`, `/admin/banners` (bandes pub), `/admin/campaigns`, `/admin/pricing`, `/admin/providers`.
Si vous êtes renvoyé vers `/dashboard`, le rôle n'est pas « admin » ; vers `/verify-age`, la date de naissance manque.

## 7. Résultats des tests

**Exécutés, réussis** : `test:cloudflare` (20 groupes : texte, bascule, erreurs, image, voix STT/TTS, vidéo et ASMR Pollinations, vision, contexte ZIP) ; `test:attachments-zip` (7 groupes : projet valide, ZIP Slip, bombes, chiffrée, tronquée, liens, secrets, gros projet) ; `test:attachments-wiring` (7 groupes : octets, noms, prix serveur, route, migration, client, suppression de compte) ; `test:credit-economics`, `test:generation-gateway`, `test:generation-gateway-cost-guard`, `test:credit-admission`, `test:provider-execution-admission`, `test:provider-visibility`, `test:voice-security`, `test:video`, `test:asmr`, et 16 autres scripts existants (27 scripts sur 35 passent ; voir aussi §10). Typecheck (`tsc --noEmit`) propre.
**Échecs déjà présents AVANT mes changements (messages identiques sur la sauvegarde)** : `test:providers` (assertion périmée sur l'URL d'image publique), `test:rewards`, `test:locale`, `test:profile-prefs`, `test:pricing`, `test:music` (import manquant), `test:db` et `test:rate-limit` (PGlite). Je ne les ai pas modifiés ; `test:pricing` mérite un contrôle de votre côté avant la prochaine mise en production.
**Impossibles à exécuter ici** : `next build` (pas de réseau, binaire SWC Linux absent de `node_modules`) ; tout appel réel à Cloudflare, Pollinations, ElevenLabs et Supabase.
**Restent à faire chez vous** : build, migration 0050, essai réel de chaque fournisseur (voir §8), et correction éventuelle des 8 tests anciens.

## 8. Limites et points à confirmer (honnêtement)
- **Aucun appel réel** n'a été fait : les formes de requête Cloudflare (texte, vision `image_url`, TTS) et Pollinations (`/video/{prompt}?model&duration&aspectRatio`) reposent sur la documentation et des sources tierces ; à confirmer avec un vrai essai et le modèle choisi.
- **Vidéo Pollinations = réponse synchrone** (30 s à plusieurs minutes). Les fonctions Netlify standard s'arrêtent bien avant (10 s par défaut, ~26 s au maximum) : **les vidéos risquent d'échouer sur Netlify** tant que l'exécution n'est pas déplacée (fonction en arrière-plan, ou hébergeur à durée plus longue). À décider avec vous.
- **Retouche d'image : non implémentée.** Le prix (2 crédits) est défini, mais aucun modèle d'édition vérifié n'est branché ; l'interface ne la promet pas.
- **Modification d'un ZIP et nouvelle archive : non implémentée.** NOXIA analyse et propose des corrections, il ne modifie ni ne renvoie de fichiers.
- **Musique via ElevenLabs : non branchée** (le module existe mais aucun fournisseur n'est enregistré ; ASMR audio ElevenLabs inchangé).
- Envoi limité à 4 Mo par fichier (corps de requête Netlify ~6 Mo) ; 3 images et 1 ZIP par message au maximum.
- Les images envoyées ne passent pas par la modération de texte existante.
- Sources non officielles consultées pour la vision Cloudflare ; la page officielle du modèle choisi fait foi.

## 9. Retour arrière
- Code : `git checkout sauvegarde-avant-ameliorations` (ou `git revert` des commits de la branche). Le dossier `.git` est inclus dans l'archive.
- Variables : repasser `AGENT_PROVIDER=openrouter`, `IMAGE_PROVIDER=huggingface`, `VIDEO_PROVIDER=fal`, `ASMR_PROVIDER=fal-video`, `CHAT_ATTACHMENTS_ENABLED=false`. (La voix n'a plus de retour par variable : revenir au tag pour la voix ElevenLabs.)
- Base : la migration 0050 est additive ; pour la retirer : `drop table public.chat_attachments;` puis supprimer le bucket dans Supabase → Storage (uniquement s'il est vide).


## 10. Lot 2 — fenêtres de chat glissantes, anti-hallucination, paramètres médias

**Moteur de crédits : déjà atomique, NON réécrit.** `consume_credits` est un `UPDATE … WHERE credits >= montant` unique (pas de course possible) ; le chat réserve, appelle le fournisseur, puis finalise une seule fois ou rembourse (`create_pending_agent_message_atomic`, `finalize_agent_message`). Je n'y ai pas touché ; seule la garde de prix TypeScript a été élargie au barème (1 ou 2 crédits).

**Fenêtres glissantes (`supabase/migrations/0051_chat_windows.sql`, additive, à coller à la main).**
- Durées en base (`chat_window_rules`, modifiables) : Free 210 min (3 h 30), Plus 360 min (6 h), Pro 540 min (9 h), Ultra 720 min (12 h).
- Une fenêtre s'ouvre au 1er message et dure la durée du plan ; la suivante s'ouvre au premier message **après** son expiration (glissante, pas calée sur le calendrier). L'historique des fenêtres est conservé.
- `chat_window_enter` : verrou consultatif par utilisateur (`pg_advisory_xact_lock`) → jamais deux fenêtres ouvertes, aucun dépassement de plafond par des requêtes parallèles. `chat_window_release` annule le comptage si le message n'est pas livré. Fonctions réservées à `service_role`.
- Câblage (`src/lib/chat-windows.ts`, `agents/actions.ts`) : fenêtre comptée **avant** la réservation de crédits, libérée avec elle sur chacune des 4 sorties sans livraison. Plan lu dans l'abonnement en base côté serveur.
- **Aucune nouvelle limite n'est imposée** : `max_credits` vaut NULL pour tous les plans. Tant que vous n'avez pas fixé de plafond, la fenêtre sert de suivi (durée, crédits et messages utilisés). Pour en fixer un : `update public.chat_window_rules set max_credits = <valeur> where plan = 'free';`.
- Si la migration n'est pas appliquée ou si la base répond mal, le chat continue (aucun plafond n'existe sans elle) et l'incident est journalisé.
- Anciennes formules à durée (daily, weekly, monthly, annual) : règle « Free » pour l'instant (**décision à prendre**).
- Testé sur un vrai PostgreSQL (PGlite, 8 groupes, dont 9 demandes simultanées sous plafond 5 → exactement 5 acceptées). Le test a révélé et fait corriger un conflit de noms de colonnes. Limite : PGlite n'a qu'une connexion, le vrai parallélisme reste à valider sur Supabase.

**Prompts anti-hallucination (`src/lib/ai/agents/anti-hallucination.ts`, ajoutés à tous les fournisseurs de texte).** Dix règles : pas d'invention (faits, chiffres, citations, URL, sources), obligation de reconnaître ses limites, pas d'action prétendue (recherche, exécution, modification, analyse), précision demandée en cas d'ambiguïté, prudence santé/droit/finance, pas de flatterie. Placés après les règles de sécurité et avant les instructions de l'agent.
**Recherche web obligatoire : non applicable aujourd'hui.** NOXIA n'a aucun outil de recherche web branché. Tant que c'est le cas, le prompt impose de dire « je ne peux pas vérifier » et interdit de prétendre avoir cherché. Le jour où un outil existe, il suffit de passer `searchAvailable` à `true` dans `agents/shared.ts` : le prompt devient « tu DOIS chercher avant de répondre et citer les sources ». Un prompt réduit les inventions, il ne les supprime pas.

**Paramètres médias (`src/lib/ai/media-params.ts`).** Étapes FLUX schnell selon la qualité : standard 4, hd 6, ultra 8 (plage 1–8) ; prompt optimisé automatiquement (netteté, proportions, mains et anatomie seulement s'il y a un personnage, pas de filigrane ni de texte parasite sauf si du texte est demandé). Grille de résolutions (≈ 1 mégapixel, multiples de 64) fournie pour les fournisseurs qui acceptent largeur/hauteur. **FLUX schnell sur Cloudflare n'accepte ni résolution ni prompt négatif** : la résolution n'y est donc pas réglable. Ces réglages réduisent les défauts courants, ils ne les éliminent pas. Plus d'étapes consomme plus de quota Cloudflare (le prix en crédits ne change pas).
**Crédits synchronisés avec la livraison :** déjà le cas (débit uniquement à la finalisation d'un résultat validé, remboursement sinon). Contrôlé par `test:cloudflare` (I1 : image invalide → rien livré, rien stocké, rien débité) et `test:generation-gateway`.
