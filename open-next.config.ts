import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Configuration OpenNext pour Cloudflare. Sans cache incrémental (aucun KV/R2 nécessaire pour démarrer).
// Pour activer plus tard le cache : https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({});
