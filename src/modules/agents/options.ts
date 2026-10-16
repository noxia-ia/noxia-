import type { Personality, Creativity, AgentLanguage } from "@/lib/ai/agents/types";
import type { AgentStatus } from "@/types/database";
export const PERSONALITY_LABELS: Record<Personality, string> = { professional: "Professionnel", friendly: "Amical", direct: "Direct", creative: "Créatif", expert: "Expert", educational: "Pédagogique", minimalist: "Minimaliste" };
export const CREATIVITY_LABELS: Record<Creativity, string> = { low: "Faible", medium: "Moyenne", high: "Élevée" };
export const LANGUAGE_LABELS: Record<AgentLanguage, string> = { fr: "Français", en: "Anglais", es: "Espagnol", pt: "Portugais", de: "Allemand" };
export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = { active: "Actif", inactive: "Inactif" };
export const CONVERSATION_STATUS_LABELS = { active: "Active", archived: "Archivée" } as const;
