# Déployer NOXIA sur Cloudflare (Workers + OpenNext)

## 0. À savoir avant de commencer
- **Formule Cloudflare : Workers Paid (≈ 5 $/mois) en pratique obligatoire.** À ma connaissance, la formule gratuite limite le temps de calcul à 10 ms par requête et la taille du Worker à 3 Mo compressés, ce qui est trop juste pour une application Next.js avec rendu serveur. Vérifie les limites actuelles sur developers.cloudflare.com/workers/platform/limits.
- **Node 20 ou plus** (Codespaces : `node -v`).
- **Vidéo** : la fonction de fond Netlify (`netlify/functions`) n'existe pas sur Cloudflare. Sans la variable `NOXIA_JOB_SECRET`, la vidéo repasse automatiquement en mode synchrone : elle fonctionne tant que la page reste ouverte pendant la création. La version en tâche de fond pour Cloudflare (Queues) n'est pas faite.
- **Non testé** : cette configuration suit la documentation officielle OpenNext/Cloudflare, mais je n'ai pas pu déployer NOXIA sur Cloudflare depuis mon environnement. Le premier déploiement est le vrai test.

## 1. Installer les outils (une seule fois, dans le dossier du projet)
```
npm i -D @opennextjs/cloudflare@latest wrangler@latest
npm pkg set scripts.cf:preview="opennextjs-cloudflare build && opennextjs-cloudflare preview"
npm pkg set scripts.cf:deploy="opennextjs-cloudflare build && opennextjs-cloudflare deploy"
```
Ces commandes ajoutent les deux paquets et deux scripts sans toucher au reste de `package.json`.

## 2. Vérifier en local
```
npm run typecheck
npm run cf:preview
```
(`cf:preview` lit `.dev.vars` : copie `.dev.vars.example` en `.dev.vars` et remplis-le.)

## 3A. Déployer depuis Cloudflare, sans rien compiler chez toi (recommandé)
1. dash.cloudflare.com > **Workers & Pages** > **Create** > **Import a repository** > choisis ton dépôt GitHub.
2. Nom du projet : `noxia` (doit être identique à `name` dans `wrangler.jsonc`).
3. **Build command** : `npx opennextjs-cloudflare build`
4. **Deploy command** : `npx wrangler deploy`
5. **Build variables** (Settings > Build > Variables) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Les variables `NEXT_PUBLIC_…` sont intégrées au code **à la compilation** : elles doivent exister ici, pas seulement à l'exécution.
6. **Variables and Secrets** (Settings > Variables and Secrets) : toutes les autres du fichier `.dev.vars.example` (clés en « Secret »).

## 3B. Déployer depuis ton terminal
```
npx wrangler login
npm run cf:deploy
```
Dans un Codespace, `wrangler login` ne peut pas ouvrir de navigateur : crée plutôt un jeton API (Cloudflare > My Profile > API Tokens > modèle « Edit Cloudflare Workers »), puis :
```
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npm run cf:deploy
```
Ajoute les secrets un par un : `npx wrangler secret put SUPABASE_SECRET_KEY`, etc.

## 4. Après le premier déploiement (indispensable)
Ton site a une nouvelle adresse (`https://noxia.<ton-compte>.workers.dev`).
- **Supabase > Authentication > URL Configuration** : mets cette adresse dans « Site URL » et ajoute-la aux « Redirect URLs ». Sans ça, la connexion et la confirmation d'e-mail échouent.
- Vérifie : connexion, image, envoi d'un fichier, bulle de support.

## 5. Si quelque chose échoue
- « No such module / node: » : vérifie `compatibility_flags` dans `wrangler.jsonc`.
- Erreur 1102 (limite de calcul) ou taille dépassée : formule Workers Paid.
- Logo ou images cassés : supprime le bloc `images` de `wrangler.jsonc`, ou mets `images: { unoptimized: true }` dans `next.config.mjs`.
- Copie le message d'erreur complet : ne le résume pas.
