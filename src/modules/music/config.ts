import { musicCreditCost, NOXIA_GENERATION_COSTS } from "@/lib/generation-costs";
export const MUSIC_CREDIT_COST = NOXIA_GENERATION_COSTS.music.perGeneration; // 8 crédits par musique
export const musicCost = (durationSeconds: number) => musicCreditCost(durationSeconds);
export const PROMPT_MIN = 10;
export const PROMPT_MAX = 2000;
export const NOT_CONFIGURED_MESSAGE = "Cette fonction est momentanément indisponible. Réessaie un peu plus tard.";
