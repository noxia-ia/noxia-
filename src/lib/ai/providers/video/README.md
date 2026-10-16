# Fournisseurs — module VIDEO

Dossier réservé aux implémentations du module **VIDEO**. Il est volontairement vide : **aucun fournisseur n'est connecté**.

- Interface à implémenter : `VideoProvider` (dans `src/lib/ai/video/types.ts`).
- Un fichier par fournisseur : `<id>.ts`, qui commence par `import "server-only";`.
- Ne lit jamais `process.env` lui-même : la clé arrive via `ctx.apiKey` (fabrique `create` de `register.ts`).
- Lance des `ProviderError` (voir `src/lib/providers/errors.ts`), jamais d'erreur brute ; respecte le `signal` d'annulation.
- Activation : l'enregistrer dans `src/lib/providers/register.ts`, puis renseigner les variables `VIDEO_PROVIDER*` et sa clé (voir `docs/PROVIDERS.md`).
