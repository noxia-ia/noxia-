import type { ImageCount } from "@/lib/ai/image/types";
import { imageCreditCost, NOXIA_GENERATION_COSTS } from "@/lib/generation-costs";
export const IMAGE_CREDIT_COST = NOXIA_GENERATION_COSTS.image.perImage;
export const imageCost = (count: ImageCount) => imageCreditCost(count);
export const PROMPT_MIN = 10;
export const PROMPT_MAX = 2000;
export const NOT_CONFIGURED_MESSAGE = "Cette fonction est momentanément indisponible. Réessaie un peu plus tard.";
