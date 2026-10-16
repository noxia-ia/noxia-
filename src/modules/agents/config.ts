import { AGENT_MESSAGE_CREDIT_COST as CENTRAL_AGENT_COST } from "@/lib/generation-costs";
export const AGENT_MESSAGE_CREDIT_COST = CENTRAL_AGENT_COST;
export const MAX_AGENTS = 20;
export const LIMITS = { name: { min: 2, max: 60 }, description: 300, objective: 300, role: { min: 2, max: 100 }, instructions: { min: 10, max: 4000 }, domain: 100, personalityCustom: 300, message: 4000, history: 20 } as const;
export const NOT_CONFIGURED_MESSAGE = "Cette fonction est momentanément indisponible. Réessaie un peu plus tard.";
export const AGENT_NOT_CONFIGURED_MESSAGE = "Cette fonction est momentanément indisponible. Réessaie un peu plus tard.";
