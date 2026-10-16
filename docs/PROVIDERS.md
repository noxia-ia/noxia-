# Fournisseurs IA — guide d'intégration

## État des fournisseurs (étape 14)

| Fournisseur | Modules | État |
|---|---|---|
| OpenRouter | CODE, AGENTS | **Branché** (API « chat completions », texte). Jamais testé en ligne : voir « Vérifier OpenRouter » ci-dessous. |
| Hugging Face | IMAGE | **Branché dans le code (étape 14)**, tâche text-to-image, fournisseur `hf-inference`. **Jamais appelé en réel** : aucune clé ni accès réseau lors de l'étape 14. Voir §9. |
| « API de génération de code » | — | **Non branché** : fournisseur non identifié (ni nom, ni endpoint). |
| VIDEO, ASMR | — | Aucun fournisseur. |

### Activer OpenRouter
1. `OPENROUTER_API_KEY` (clé, serveur uniquement), `OPENROUTER_MODEL_CODE` et/ou `OPENROUTER_MODEL_AGENT` (identifiant exact du modèle ; **aucun modèle par défaut** : absent = « Configuration incomplète »).
2. `CODE_PROVIDER=openrouter` et/ou `AGENT_PROVIDER=openrouter` (ou `_SECONDARY` / `_FALLBACK`).
3. `/admin/providers` → « Tester » : doit afficher « Connecté ». Le test appelle `GET /api/v1/key` (aucune génération, aucun crédit).
4. Choisir un modèle capable de suivre l'instruction « répondre uniquement par un JSON » : sinon CODE échoue en `RESULT_INVALID` (aucun crédit débité, bascule vers le secondaire s'il existe).

### Vérifier OpenRouter (à faire une fois, sur votre machine)
Le code a été écrit d'après l'API publique d'OpenRouter (`POST https://openrouter.ai/api/v1/chat/completions`, en-tête `Authorization: Bearer`, réponse `choices[0].message.content`, et `GET /api/v1/key` pour le test de santé). Cet environnement n'avait ni réseau ni clé : **rien n'a été confirmé en ligne**. Si le bouton « Tester » n'affiche pas « Connecté » avec une clé valide, le point à corriger est l'URL de santé dans `src/lib/ai/providers/openrouter-client.ts`.


DRACULA AI a **une seule architecture officielle** : `src/lib/providers/`. Aucun module (CODE, IMAGE, VIDEO, ASMR, AGENTS) n'appelle une API externe : tout passe par le **registre** (`registry.ts`) et l'**exécuteur** (`execute.ts`). Aucun fournisseur n'est connecté aujourd'hui, et aucun fournisseur fictif n'existe : sans fournisseur, l'utilisateur lit « Aucun fournisseur IA n'est actuellement disponible. » et rien n'est simulé.

| Fichier | Rôle |
|---|---|
| `types.ts` | `ProviderConfig`, `ProviderContext` |
| `config.ts` | délais, limites, préfixes de variables, délais de péremption |
| `errors.ts` | 14 codes d'erreur, messages français, politique de réessai / bascule |
| `log.ts` | journal minimal (liste blanche de champs, jamais de prompt ni de clé) |
| `register.ts` | **seul endroit** où brancher un fournisseur |
| `registry.ts` | registre, validation de configuration, chaîne principal → secondaire → secours |
| `execute.ts` | timeout, réessais, bascule, validation du résultat |
| `pipeline.ts` | contrôles avant appel, finalisation (débit unique) |
| `health.ts` | test de santé sans crédit + dernière vérification |
| `http.ts` | aide HTTP réservée aux fournisseurs (HTTPS, taille bornée) |

## 1. Ajouter un fournisseur

1. **Implémentation** : `src/lib/ai/providers/<module>/<id>.ts` (`code`, `image`, `video`, `asmr`, `agents`). Elle implémente l'interface du module :

   | Module | Interface | Fichier de types |
   |---|---|---|
   | code | `AIProvider` | `src/lib/ai/types.ts` |
   | image | `ImageProvider` | `src/lib/ai/image/types.ts` |
   | video | `VideoProvider` | `src/lib/ai/video/types.ts` |
   | asmr | `ASMRProvider` | `src/lib/ai/asmr/types.ts` |
   | agents | `AgentProvider` | `src/lib/ai/agents/types.ts` |

   Règles : première ligne `import "server-only";` ; la clé arrive par le constructeur (`ctx.apiKey`), jamais par `process.env` dans le fournisseur ; appels HTTP via `providerFetchJson()` ; respecter `opts.signal` ; ne jamais renvoyer le corps d'une erreur distante.
2. **Variable d'environnement** : sa clé, côté serveur (`IMAGE_API_KEY`, ou un nom propre au fournisseur). **Jamais `NEXT_PUBLIC_`** (le registre refuse un tel nom).
3. **Enregistrement** : dans `registerAll()` de `register.ts` (exemple complet dans ce fichier). Champs de configuration :

   | Champ | Sens |
   |---|---|
   | `id` | `[a-z0-9_-]`, 1 à 40 caractères ; valeur de `IMAGE_PROVIDER`… |
   | `name` | nom affiché dans `/admin/providers` |
   | `module` | doit être égal au module d'enregistrement |
   | `enabled` | interrupteur ; `false` = jamais utilisé |
   | `model` | modèle (chaîne vide si unique) |
   | `timeoutMs`, `maxRetries` | sinon valeurs par défaut du module (`config.ts`) |
   | `supportsAsync`, `supportsPolling` | job asynchrone ; l'asynchrone **exige** `getJob()` |
   | `apiKeyEnv` | NOM de la variable de la clé (jamais sa valeur) |
   | `userSelectable` | `true` seulement si l'utilisateur peut choisir ce fournisseur (agents) |
   | `assetHosts` | hôtes d'où viennent les fichiers temporaires (voir §6) |

   Une configuration invalide **fait échouer le démarrage** avec un message explicite (erreur de développeur, jamais vue par un utilisateur).
4. **Activation** : renseigner `<MODULE>_PROVIDER=<id>` (`CODE`, `IMAGE`, `VIDEO`, `ASMR`, `AGENT`). Un fournisseur n'entre dans la chaîne que s'il est enregistré, `enabled` et si sa clé est présente.

## 2. Principal, secondaire, secours

`<MODULE>_PROVIDER` (principal) → `<MODULE>_PROVIDER_SECONDARY` → `<MODULE>_PROVIDER_FALLBACK`. On passe au suivant **uniquement** pour une panne du fournisseur (indisponible, timeout, limite de débit, mauvaise configuration, résultat invalide). **Jamais** de bascule ni de réessai pour : contenu refusé, requête invalide, crédits, âge, sécurité. Le premier résultat valide est retourné : un seul fournisseur est facturé par demande réussie.

## 3. Tester la santé

`/admin/providers` → bouton « Tester ». Si le fournisseur implémente `healthCheck()`, il est appelé (délai 5 s) ; sinon seule la configuration est vérifiée. `healthCheck()` ne doit **jamais** envoyer de prompt payant. Aucun crédit n'est touché. Seuls le statut et la date sont conservés (table `provider_health_checks`, migration 0010). En cas d'échec, l'administrateur ne voit qu'un message générique.

## 4. Erreurs

Le fournisseur **lance** une `ProviderError(code, détailInterne)`. Pour une réponse HTTP : `fromHttpStatus(res.status)`. Les exceptions inconnues deviennent `GENERATION_FAILED`. L'utilisateur ne voit que le message français de `USER_MESSAGES` ; le détail interne n'est ni affiché, ni stocké, ni journalisé. Toute génération échouée ou invalide : **aucun crédit débité**.

## 5. Jobs asynchrones (image, vidéo, ASMR)

1. `generate()` renvoie `{ status: "processing", jobId }` (déclarer `supportsAsync` + `supportsPolling`).
2. La génération passe en `processing` (fournisseur et `jobId` enregistrés). Aucun crédit n'est débité.
3. Le bouton « Actualiser » appelle `refresh<Module>JobAction(generationId)` : le navigateur n'envoie que l'identifiant ; le fournisseur **enregistré sur la génération** est interrogé via `getJob(jobId)`, au plus une fois toutes les 5 s par génération.
4. Résultat validé → finalisation atomique : débit unique en base. Une seconde finalisation est refusée par la base (`already_finalized`).
5. Panne passagère pendant le suivi : la génération reste « en cours ». Échec définitif : « échec », aucun crédit.

## 6. Stockage permanent (Supabase Storage branché pour les IMAGES — voir §9)

Chaîne : fichier temporaire du fournisseur → validation → téléchargement **serveur** → `StorageProvider.put()` → ligne `stored_assets` → `storedUrl`.

- Rien n'est téléchargé tant qu'il n'y a pas **à la fois** un `StorageProvider` (`STORAGE_PROVIDER`) **et** des `assetHosts` sur le fournisseur IA.
- Contrôles (`src/lib/storage/`) : HTTPS uniquement, hôte dans `assetHosts`, pas d'IP littérale, port 443, toutes les adresses résolues publiques (protection SSRF), aucune redirection suivie, taille maximale par type, type MIME autorisé **et** premiers octets vérifiés (pas de SVG).
- Expiration : `RETENTION_DAYS` dans `src/lib/storage/policy.ts` (`null` = illimitée), purge par la tâche de maintenance.
- **Suppression de compte** : appeler `removeAllForUser(userId)` **avant** la suppression du compte ; si `failed > 0`, ne pas supprimer le compte (la cascade effacerait la liste des fichiers). Il n'existe pas encore de fonction de suppression de compte dans l'application.
- Pour brancher un stockage : implémenter `StorageProvider` (`put`, `remove`), l'ajouter au registre de `src/lib/storage/index.ts`. Décision prise pour les images (étape 14) : bucket public à chemins non devinables (`SupabaseStorage`, voir §9) ; la variante « bucket privé + route authentifiée » n'est pas implémentée. Les fournisseurs qui renvoient des octets passent par `persistBytes()` (aucun téléchargement, donc pas de SSRF).
- Limite connue : le DNS est résolu une fois pour le contrôle, puis par `fetch()`. L'allowlist `assetHosts` réduit ce risque ; un épinglage d'IP serait un renforcement.

## 7. Générations bloquées (tâche planifiée à configurer)

La fonction SQL `expire_stale_generations` (migration 0010) passe en « échec », sans débit ni résultat inventé :
- `pending` depuis plus de **15 min** ; messages d'agent `pending` idem ;
- `processing` sans aucune actualisation depuis plus de **60 min** (un job asynchrone n'envoie pas de nouvelles sans actualisation ; 15 min échouerait des vidéos légitimes).

Elle est lancée par `GET|POST /api/cron/maintenance` avec l'en-tête `Authorization: Bearer <CRON_SECRET>` (qui purge aussi les fichiers stockés expirés ou orphelins). **À configurer sur l'hébergement** :
1. Définir `CRON_SECRET` (≥ 16 caractères aléatoires, variable serveur).
2. Créer une tâche planifiée toutes les 5 à 15 minutes qui appelle cette URL avec l'en-tête ci-dessus (Vercel Cron envoie automatiquement `Authorization: Bearer $CRON_SECRET` ; sinon un planificateur externe).
3. Alternative sans hébergeur : `pg_cron` côté Supabase appelant `select * from public.expire_stale_generations();` (sans purge de fichiers).

## 8. Durées de fonction (hébergement serverless)

Les délais par défaut (vidéo 300 s, ASMR 180 s) peuvent dépasser la durée maximale des fonctions de l'hébergeur. Pour la vidéo, préférer un fournisseur **asynchrone** (réponse immédiate + suivi). À vérifier au choix de l'hébergeur.

## 9. Hugging Face — DRACULA IMAGE (étape 14)

**Statut honnête : code écrit et testé localement ; AUCUN appel réel à Hugging Face n'a eu lieu** (pas de `HF_API_KEY` ni d'accès réseau vers Hugging Face dans l'environnement de l'étape 14). Ne pas considérer IMAGE comme terminé avant le test réel ci-dessous.

### Ce qui a été branché
- `src/lib/ai/providers/image/huggingface.ts` — implémente `ImageProvider`, enregistré dans `register.ts` (id `huggingface`, module `image`, `requiresStorage: true`).
- `src/lib/ai/image/bytes.ts` — validation des octets : type réel par signature (PNG, JPEG, WebP ; SVG, HTML, JSON, GIF… refusés par construction), image non tronquée, dimensions lues (≤ 8192 px par côté, ≤ 40 Mpx), taille ≤ 15 Mo, Content-Type annoncé qui contredit les octets → refus.
- `src/lib/providers/http.ts` → `providerFetchBytes()` — lecture binaire bornée en flux (HTTPS, pas de redirection, corps d'erreur jamais lu).
- `src/lib/storage/supabase-storage.ts` + `persistBytes()` / `discardStored()` dans `src/lib/storage/index.ts` — Supabase Storage via le `StorageProvider` existant (pas de seconde architecture).
- `supabase/migrations/0012_image_storage_bucket.sql` — bucket.
- `ImageProvider.generate(req, { signal, userId, generationId })` : champs **optionnels** ajoutés ; `userId` et `generationId` viennent du serveur (jamais du navigateur).

### API Hugging Face utilisée (source : documentation officielle « Inference Providers › Tasks › Text to Image »)
| Élément | Valeur | Statut |
|---|---|---|
| Endpoint | `POST https://router.huggingface.co/hf-inference/models/<organisation>/<modèle>` | **Déduit** du schéma d'URL documenté pour hf-inference (la page de la tâche ne donne pas l'URL brute). **Non confirmé par un appel réel.** |
| Authentification | `Authorization: Bearer <jeton>` ; jeton avec la permission « Inference Providers » | Documenté |
| Corps | `{ "inputs": "<prompt>", "parameters": { "width": n, "height": n } }` | Documenté (autres paramètres possibles : `guidance_scale`, `negative_prompt`, `num_inference_steps`, `scheduler`, `seed` — **non envoyés**, leurs valeurs idéales dépendent du modèle) |
| Réponse | image en **octets bruts** dans le corps | Documenté. Content-Type renvoyé : **non confirmé** |
| Test de santé | `GET https://huggingface.co/api/whoami-v2` (jeton valide ?) | Décrit par l'équipe Hugging Face sur son forum officiel. Ne prouve **ni** la permission « Inference Providers » **ni** la disponibilité du modèle |
| Modèle | `HF_MODEL_IMAGE` = `organisation/modèle`, **aucun défaut** | Choix à faire par vous. Il doit être servi par `hf-inference` pour `text-to-image` : à vérifier (depuis juillet 2025, hf-inference se concentre surtout sur l'inférence CPU) |

Une image par requête : `count` = 2 ou 4 → autant d'appels en parallèle, **tout est validé avant de stocker quoi que ce soit** ; un échec = rien de stocké, aucun débit. Les `width`/`height` sont déduits du ratio (`1:1` 1024², `4:5` 896×1120, `3:4` 896×1152, `16:9` 1344×768, `9:16` 768×1344) ; le modèle peut les limiter ou les ajuster : seules les dimensions **réelles** de l'image reçue sont enregistrées. Le style est ajouté au prompt (déjà modéré). `quality` et `format` ne sont **pas** transmis au modèle (le format enregistré est le format réellement reçu).

Erreurs : 401/402/403 → `PROVIDER_MISCONFIGURED` (un appel) ; 400/404/422 → `INVALID_REQUEST` ; 429, 5xx, délai → temporaires (1 réessai) ; 451 → `CONTENT_BLOCKED` ; image invalide → `RESULT_INVALID` ; panne de NOTRE stockage → `GENERATION_FAILED` (pas de réessai : un second appel serait payant). Le corps d'erreur de Hugging Face n'est jamais lu ni affiché. Délai : 120 s pour l'ensemble de la génération (valeur par défaut du module `image`).

### Stockage
- **Bucket** `dracula-images` (migration 0012), **public en lecture**, 15 Mo max, `image/png`, `image/jpeg`, `image/webp` seulement.
- **Chemin** `<userId>/<generationId>/<uuid>.<png|jpg|webp>` — trois UUID, choisis par le serveur ; `SupabaseStorage` refuse tout autre chemin.
- **Contrôle d'accès** : écriture/suppression uniquement avec la clé serveur (aucune politique `storage.objects` pour `anon`/`authenticated`). **Lecture : quiconque possède le lien voit l'image** (le secret est l'UUID du chemin, non devinable). Choix assumé parce que l'URL permanente est enregistrée dans le résultat. Si ce niveau est insuffisant pour votre contenu, la variante est un bucket privé + une route authentifiée qui vérifie le propriétaire : non implémentée.
- **URL** : permanente (publique), pas signée.
- **Suppression** : fichier + ligne `stored_assets` retirés immédiatement en cas d'échec partiel ; sinon la tâche de maintenance (§7) purge les fichiers d'une génération échouée depuis plus d'1 h, expirés (`RETENTION_DAYS`, illimité par défaut) ou orphelins ; `removeAllForUser()` doit être appelé avant toute suppression de compte (pas encore branché à une action de suppression de compte).
- **Activation** : `STORAGE_PROVIDER=supabase-storage`. Sans lui, Hugging Face est « Configuration incomplète » (jamais de `data:` URL, jamais de faux `storedUrl`).

### Crédits
Coût `IMAGE_CREDIT_COST × nombre d'images` (`src/modules/image/config.ts`), calculé côté serveur, **plafonné au nombre d'images réellement livrées et validées** ; débit atomique unique à la finalisation (`finalize_generation`) ; échec = 0 débit. Le contrôle des crédits avant l'appel est une lecture, **sans réservation** : deux requêtes simultanées peuvent déclencher deux appels payants pour un seul solde (limite connue, voir l'étape 13). La valeur 1 crédit/image reste provisoire.

### Variables
`HF_API_KEY` (serveur seulement), `HF_MODEL_IMAGE`, `IMAGE_PROVIDER=huggingface` (ou `_SECONDARY` / `_FALLBACK`), `STORAGE_PROVIDER=supabase-storage`.

### À faire sur votre machine pour valider réellement
1. Exécuter la migration `0012`, renseigner `.env.local` (`HF_API_KEY`, `HF_MODEL_IMAGE`, `IMAGE_PROVIDER=huggingface`, `STORAGE_PROVIDER=supabase-storage`, variables Supabase).
2. `/admin/providers` → IMAGE → « Tester » : « Connecté » signifie **seulement** que le jeton est valide.
3. Générer UNE image avec le prompt neutre « A cinematic landscape of a tropical city at sunset, realistic photography style », 1 image, avec un petit solde. Vérifier : image affichée depuis `storedUrl`, ligne dans `stored_assets`, fichier dans le bucket, `credits_used = 1`, solde −1, historique.
4. Si l'appel échoue en `PROVIDER_MISCONFIGURED`/`INVALID_REQUEST` alors que le jeton est valide : l'URL, le modèle ou ses paramètres sont en cause (voir le tableau ci-dessus) ; le journal serveur contient le code interne (`http_<statut>`), jamais le corps.
5. Tester un échec réel (modèle inexistant) : aucun débit, message générique.

### Tests automatiques
`npm run test:providers` (24 groupes CODE/AGENTS + 21 groupes IMAGE, faux `fetch`, aucun réseau) et `npm run test:db` (11 groupes SQL sur un vrai PostgreSQL via PGlite, vraies migrations 0001 → 0012). Ces tests ne prouvent pas que Hugging Face répond.

## Étape 16 — VIDEO prêt à recevoir un fournisseur réel

Le module VIDEO conserve le registre multi-provider existant et n'enregistre aucun fournisseur réel tant qu'aucune API/documentation n'a été fournie. Les variables `VIDEO_PROVIDER`, `VIDEO_PROVIDER_SECONDARY` et `VIDEO_PROVIDER_FALLBACK` restent disponibles côté serveur.

Le contrat `VideoProvider` accepte une réponse synchrone terminée ou un job asynchrone (`processing` + `jobId`) suivi par `getJob()`. Le dashboard utilise déjà `refreshVideoJobAction`, la génération stocke le fournisseur et le `provider_job_id`, et `claimPoll()` limite les appels rapprochés.

### Stockage vidéo

La migration `0013_video_storage_bucket.sql` ajoute `dracula-videos`, bucket **privé**, limité à 100 Mo et `video/mp4` / `video/webm`. Aucun rôle navigateur ne reçoit de droit d'écriture ou de lecture directe. Le serveur écrit le fichier et `/api/media/video` vérifie la session et la propriété de `stored_assets` avant de délivrer une URL signée courte.

Les images continuent d'utiliser `dracula-images` comme avant. Le provider `supabase-storage` sait maintenant stocker les images et les vidéos, avec une politique différente par type.

### Fournisseur réel manquant

Aucun endpoint, modèle ou format de job n'a été inventé. Pour brancher VIDEO, il faut le nom du fournisseur et sa documentation API (création de job, statut, résultat, authentification, formats et limites). Une fois ces informations disponibles, l'implémentation doit être placée dans `src/lib/ai/providers/video/<id>.ts`, puis enregistrée dans `src/lib/providers/register.ts`.


## ElevenLabs — ASMR audio

Le fournisseur `elevenlabs` est enregistré pour le module ASMR et utilise l'API officielle Text-to-Sound Effects (`/v1/sound-generation`) avec le modèle `eleven_text_to_sound_v2`. La réponse audio est reçue en octets côté serveur puis validée et rangée dans le bucket privé `dracula-audio`.

Activation serveur :

```env
ASMR_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=
STORAGE_PROVIDER=supabase-storage
```

Le fournisseur est volontairement limité au type `audio` à cette étape : aucune vidéo ou image fictive n'est générée par ElevenLabs. La clé n'est jamais exposée au navigateur.
