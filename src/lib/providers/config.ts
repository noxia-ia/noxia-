import type { ProviderModule } from "./types";
// Valeurs par défaut modifiables (serveur). Un fournisseur peut les surcharger dans sa ProviderConfig.
export const DEFAULT_TIMEOUTS_MS: Record<ProviderModule, number> = { code: 120_000, image: 120_000, asmr: 180_000, video: 300_000, music: 300_000, agents: 60_000 };
export const DEFAULT_MAX_RETRIES = 1; // tentatives supplémentaires, erreurs temporaires uniquement
export const RATE_LIMITS_PER_MINUTE: Record<ProviderModule, number> = { code: 5, image: 5, video: 3, asmr: 5, music: 3, agents: 20 };
export const MODULE_ENV_PREFIX: Record<ProviderModule, string> = { code: "CODE", image: "IMAGE", video: "VIDEO", asmr: "ASMR", music: "MUSIC", agents: "AGENT" };
export const MODULE_TITLES: Record<ProviderModule, string> = { code: "NOXIA CODE", image: "NOXIA IMAGE", video: "NOXIA VIDEO", asmr: "NOXIA AUDIO", music: "NOXIA MUSIC", agents: "NOXIA AGENTS" };
export const PROVIDER_MODULES: ProviderModule[] = ["code", "image", "video", "asmr", "music", "agents"];
export const PROVIDER_ID_RE = /^[a-z0-9_-]{1,40}$/;

// Générations bloquées (voir supabase/migrations/0010 et src/app/api/cron/maintenance).
export const STALE_PENDING_MINUTES = 15;     // « pending » : l'appel au fournisseur a forcément fini (timeout max 5 min)
export const STALE_PROCESSING_MINUTES = 60;  // « processing » : job asynchrone sans aucune actualisation depuis ce délai
export const POLL_COOLDOWN_SECONDS = 5;      // délai minimal entre deux actualisations d'un même job
