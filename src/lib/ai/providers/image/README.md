# Fournisseurs — module IMAGE

Implémentations du module **IMAGE** (interface `ImageProvider`, dans `src/lib/ai/image/types.ts`).

- `huggingface.ts` — Hugging Face (tâche text-to-image, `hf-inference`). Renvoie des OCTETS : validés (`src/lib/ai/image/bytes.ts`) puis rangés dans Supabase Storage. Voir `docs/PROVIDERS.md` §9. **Jamais appelé en réel à ce jour.**

Pour en ajouter un :
- Un fichier par fournisseur : `<id>.ts`, qui commence par `import "server-only";`.
- Ne lit jamais `process.env` lui-même : la clé arrive via `ctx.apiKey` (fabrique `create` de `register.ts`).
- Lance des `ProviderError` (voir `src/lib/providers/errors.ts`), jamais d'erreur brute ; respecte le `signal` d'annulation.
- Réponse en URL HTTPS temporaire : déclarer `assetHosts` (téléchargement validé par `persistAsset`). Réponse en octets : `requiresStorage: true` et `persistBytes()`. Jamais de `data:` URL.
- Activation : l'enregistrer dans `src/lib/providers/register.ts`, puis renseigner les variables `IMAGE_PROVIDER*` et sa clé.
