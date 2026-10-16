# NOXIA — Livrable fusionné (fichiers + admin ZK + NSFW/marketing + menus)

Ce ZIP regroupe (admin-dash + filegen + menus) :

0. **Menus chat** (AttachMenu, ChatOptionsMenu, HomeChat, Icon, useDismiss, globals.css, package.json)

1. **Analyse & génération de fichiers** (PDF / ZIP / RAR → digest IA ; génération ZIP/PDF téléchargeables)
2. **Dashboard admin Zero-Knowledge** (stats macro, moteurs médias, compteur public d'inscrits)
3. **NSFW & analytics marketing** (garde-fous âge, ROI / CAC / conversions par source)

## Conflit résolu à la fusion

`src/lib/attachments/client.ts` existait en 2 versions (filegen / menus). Version retenue : **filegen** (`SERVER_SUPPORT.pdf/rar = true`, cohérent avec le serveur), avec `export` ajouté sur `crc32` (utilisé par `tests/attachments-client.test.mjs`). Le test a été mis à jour (PDF/RAR = true).

## Structure

```
src/components/chat/     # AttachMenu, ChatOptionsMenu, HomeChat, Icon
src/hooks/               # useDismiss
src/styles/globals.css
src/lib/attachments/     # sniff, pdf, rar, zip, service, generate, protocol IA
src/lib/admin/           # analytics, nsfw, marketing
src/app/api/chat/        # attachments + generated download
src/app/api/public/      # signup-count
src/app/admin/           # analytics, nsfw, marketing pages
src/components/landing/  # PublicSignupCounter
supabase/migrations/
  0052_chat_files_pdf_rar_generated.sql
  0053_admin_zk_analytics_nsfw_marketing.sql
docs/
tests/
```

## Installation rapide

1. Exécuter les migrations SQL **dans l'ordre** (0052 puis 0053) dans Supabase SQL Editor.
2. Copier les dossiers `src/`, `supabase/`, `docs/`, `tests/` dans le repo NOXIA.
3. Voir les guides d'intégration :
   - `docs/FILE_ANALYSIS_AND_GENERATION.md`
   - `docs/ADMIN_ZK_DASHBOARD.md`
4. Nav admin : ajouter les liens `/admin/nsfw` et `/admin/marketing`.
5. Env : `CHAT_ATTACHMENTS_ENABLED=true`

## Points d'intégration code

### Fichiers (point 4)
Dans `sendAgentMessageAction`, après la réponse IA :
```ts
import { processAiGeneratedFiles } from "@/lib/attachments/process-ai-files";
const finalText = await processAiGeneratedFiles(user.id, rawAssistantText);
```

### Compteur public (point 5)
```tsx
import { PublicSignupCounter } from "@/components/landing/PublicSignupCounter";
<PublicSignupCounter />
```

### Checkout NSFW (point 6)
```ts
const { data } = await supabase.rpc("user_payment_eligibility");
```

Aucune nouvelle dépendance npm.
