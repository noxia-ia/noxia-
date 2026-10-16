import type { VideoDuration, VideoParams } from "@/lib/ai/video/types";
import { NOXIA_GENERATION_COSTS, videoCreditCost } from "@/lib/generation-costs";
export const VIDEO_CREDIT_COST = NOXIA_GENERATION_COSTS.video.byDuration[5]; // prix du palier le plus court ; voir videoCreditCost pour les autres
export const VIDEO_CREDIT_BY_DURATION: Record<VideoDuration, number> = { 5: 15, 10: 25, 15: 32, 30: 50 };
export const videoCost = (p: Pick<VideoParams, "durationSeconds">) => videoCreditCost(p.durationSeconds);
export const PROMPT_MIN = 10;
export const PROMPT_MAX = 2000;
export const NOT_CONFIGURED_MESSAGE = "Cette fonction est momentanément indisponible. Réessaie un peu plus tard.";
