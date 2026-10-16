# Notes de fusion (dépôt NOXIA + livrables)

Base : `NOXIA.zip` (avec migrations 0050 pièces jointes, 0051 fenêtres de chat). Par-dessus : admin-dash, filegen, menus.

## Migrations — à exécuter dans l'ordre
- `0052_chat_files_pdf_rar_generated.sql` (ex-0051 du livrable filegen, renumérotée : 0051 était déjà `chat_windows`)
- `0053_admin_zk_analytics_nsfw_marketing.sql` (ex-0052)

## Choix faits à la fusion
- `src/lib/attachments/service.ts` : version du dépôt conservée + ajout PDF/RAR (le service du livrable filegen était une réécriture d'une version plus ancienne : il perdait `purgeExpired`, `removeAllAttachmentsForUser`, la vérification d'expiration et la déduplication des ids).
- `src/lib/attachments/client.ts` : version filegen (PDF/RAR activés) + `export` sur `crc32`.
- `src/lib/generation-costs.ts` : `AttachmentKind` élargi à pdf/rar (tarif ZIP).
- `src/app/admin/analytics/page.tsx` : remplacée par la vue Zero-Knowledge ; l'ancienne page (répartition audience + campagnes) est conservée dans `src/app/admin/analytics/audience/page.tsx`.
- `src/app/admin/layout.tsx` : liens Audience, NSFW, Marketing ajoutés.
- `src/app/dashboard/agents/actions.ts` : `processAiGeneratedFiles` branché avant `completeAssistantMessage`.
- `HomeChat.tsx`, `Icon.tsx`, `globals.css`, route `chat/attachments` : versions des livrables (sur-ensembles de celles du dépôt).

## Reste à faire côté toi
- Le prompt des agents doit expliquer le bloc ```noxia-file``` (voir `docs/FILE_ANALYSIS_AND_GENERATION.md`), sinon l'IA ne générera pas de fichiers.
- `PublicSignupCounter` à placer dans le Hero/Footer ; `?src=` à brancher à l'inscription (voir `docs/INTEGRATION_ADMIN.md`).
- Typecheck (`npm run typecheck`) et `npm run build` non lancés ici (pas de `node_modules`).
