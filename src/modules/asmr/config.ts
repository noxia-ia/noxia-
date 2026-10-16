import type { ASMRType } from "@/lib/ai/asmr/types";
import { asmrCreditCost, NOXIA_GENERATION_COSTS } from "@/lib/generation-costs";
export const ASMR_CREDIT_COST = NOXIA_GENERATION_COSTS.asmr.audio;
export const ASMR_TYPE_MULTIPLIER = { audio: 1, image: 1, video: 1 } as const;
export const asmrCost = (type: ASMRType, durationSeconds?: number) => asmrCreditCost(type, durationSeconds);
export const PROMPT_MIN = 10;
export const PROMPT_MAX = 2000;
export const NOT_CONFIGURED_MESSAGE = "Cette fonction est momentanément indisponible. Réessaie un peu plus tard.";
