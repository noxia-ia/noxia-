# Analyse & génération de fichiers (ZIP / PDF / RAR)

## Objectif

- L'utilisateur envoie des pièces jointes complexes (PDF, ZIP, RAR) dans le chat agent.
- Le serveur analyse le contenu de façon sécurisée et fournit un *digest* textuel à l'IA.
- L'IA peut à son tour **générer** un ZIP ou un PDF téléchargeable, stocké dans Supabase Storage (bucket privé).

## Flux d'analyse (upload → IA)

1. Navigateur → `POST /api/chat/attachments` (FormData `file`).
2. `saveUpload` :
   - Sniff magic bytes (`sniff.ts`) → kind `image | zip | pdf | rar`.
   - Pré-validation (ZIP bomb / PDF encrypté / taille).
   - Upload bucket privé `noxia-chat-attachments` (clé admin uniquement).
   - Insert métadonnées `chat_attachments`.
3. Au moment de l'envoi du message :
   - `claimForSend` → `loadPayload` :
     - Images → base64 pour vision.
     - ZIP → `analyzeZip` (arborescence + extraits texte, anti-slip / anti-bombe).
     - PDF → `analyzePdf` (extraction heuristique Tj/TJ, pas d'OCR).
     - RAR → résumé (pas de décompression native).
   - Digest injecté dans `attachmentContext` du provider agent.
4. `finishAttachments` : **suppression des binaires** ; seules les métadonnées restent.

## Flux de génération (IA → fichier téléchargeable)

L'assistant peut émettre un bloc :

````markdown
```noxia-file
kind: zip
name: export-projet.zip
---
path: README.md
content:
# Mon projet
---
path: src/index.ts
content:
export const hello = "world";
```
````

ou

````markdown
```noxia-file
kind: pdf
name: rapport.pdf
title: Rapport d'analyse
---
Introduction
...
```
````

Côté serveur, après la réponse de l'agent :

```ts
import { processAiGeneratedFiles } from "@/lib/attachments/process-ai-files";

const finalReply = await processAiGeneratedFiles(userId, rawAssistantReply);
// puis persister finalReply comme message assistant
```

- `generateAndStore` construit le ZIP (stored) ou le PDF minimal, upload dans `noxia-chat-generated`.
- Le placeholder est remplacé par un lien `/api/chat/generated?id=<uuid>`.
- `GET /api/chat/generated` vérifie session + propriétaire + expiration, streame le fichier.

## Sécurité

| Point | Mesure |
|--------|--------|
| Écriture storage | Uniquement clé service_role (admin) |
| RLS table | SELECT own only ; aucune INSERT/UPDATE client |
| Type fichier | Magic bytes, jamais l'extension |
| ZIP | Limites taille, profondeur, anti-bombe, secrets masqués |
| PDF | Refus si `/Encrypt`, plafonds pages/caractères |
| RAR | Accepté mais non extrait |
| Générés | TTL 24 h, bucket privé, download médiatisé |
| Origine | Contrôle same-origin sur les routes API |

## Migration

Exécuter `supabase/migrations/0052_chat_files_pdf_rar_generated.sql` dans le SQL Editor Supabase.

## Fichiers livrés

```
src/lib/attachments/
  sniff.ts          # kinds image|zip|pdf|rar
  pdf.ts            # analyzePdf
  rar.ts            # analyzeRar
  zip.ts            # analyzeZip (existant)
  service.ts        # saveUpload / loadPayload / claim / finish
  generate.ts       # buildStoredZip / buildSimplePdf / generateAndStore / downloadGenerated
  ai-file-protocol.ts
  process-ai-files.ts
  client.ts         # SERVER_SUPPORT pdf/rar = true
src/app/api/chat/attachments/route.ts
src/app/api/chat/generated/route.ts
supabase/migrations/0052_chat_files_pdf_rar_generated.sql
```

## Intégration minimale dans `sendAgentMessageAction`

Après réception de la réponse du provider et **avant** `completeAssistantMessage` :

```ts
import { processAiGeneratedFiles } from "@/lib/attachments/process-ai-files";

// ...
const raw = result.reply; // ou équivalent
const reply = await processAiGeneratedFiles(user.id, raw);
await completeAssistantMessage(..., reply);
```

Activer les pièces jointes : `CHAT_ATTACHMENTS_ENABLED=true`.
