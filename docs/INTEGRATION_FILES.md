# Intégration dans NOXIA existant

## 1. Copier les fichiers

Remplacer / ajouter dans ton repo :

```
src/lib/attachments/sniff.ts
src/lib/attachments/pdf.ts
src/lib/attachments/rar.ts
src/lib/attachments/zip.ts          # (déjà présent, recopier si besoin)
src/lib/attachments/service.ts
src/lib/attachments/generate.ts
src/lib/attachments/ai-file-protocol.ts
src/lib/attachments/process-ai-files.ts
src/lib/attachments/client.ts
src/app/api/chat/attachments/route.ts
src/app/api/chat/generated/route.ts
supabase/migrations/0052_chat_files_pdf_rar_generated.sql
```

## 2. Migration Supabase

Coller le contenu de `0052_...sql` dans le SQL Editor.

## 3. Brancher la génération dans `sendAgentMessageAction`

Fichier : `src/app/dashboard/agents/actions.ts`

```ts
import { processAiGeneratedFiles } from "@/lib/attachments/process-ai-files";
```

Juste après l'appel au provider (quand tu as le texte de réponse de l'assistant), **avant** `completeAssistantMessage` :

```ts
const finalText = await processAiGeneratedFiles(user.id, rawAssistantText);
await completeAssistantMessage(/* ... */, finalText);
```

## 4. Coût crédits (optionnel)

Dans `chatMessageCreditCost`, traiter `pdf` et `rar` comme `zip` (2 crédits) si tu veux facturer l'analyse.

## 5. Frontend

Le `client.ts` livré active `SERVER_SUPPORT.pdf` et `.rar`.
Si tu utilises le `AttachMenu` de `noxia-menus`, il lira automatiquement ces flags.

## 6. Env

```
CHAT_ATTACHMENTS_ENABLED=true
CHAT_ATTACHMENT_MAX_MB=4
```

Aucune nouvelle dépendance npm : tout est pur TypeScript / Web Crypto / Node buffer.
