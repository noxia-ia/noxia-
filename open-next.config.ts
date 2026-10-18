import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Configuration OpenNext pour Cloudflare (sans cache incrémental : aucun KV/R2 requis pour démarrer).
export default defineCloudflareConfig({});
