import type { HealthCapable } from "@/lib/providers/types";
export const PERSONALITIES = ["professional", "friendly", "direct", "creative", "expert", "educational", "minimalist"] as const;
export const CREATIVITIES = ["low", "medium", "high"] as const;
export const LANGUAGES = ["fr", "en", "es", "pt", "de"] as const; // ajouter un code ici (+ son libellé dans options.ts)
export const AGENT_STATUSES = ["active", "inactive"] as const;
export const NOXIA_COMPANION_ID = "noxia-companion" as const;

export const AGENT_ICONS = ["🤖", "🧠", "💻", "📈", "✍️", "📱", "🔎", "🤝", "🗂️", "🦇", "🩸", "🕯️"] as const;
export type Personality = (typeof PERSONALITIES)[number];
export type Creativity = (typeof CREATIVITIES)[number];
export type AgentLanguage = (typeof LANGUAGES)[number];

export interface AgentConfig {
  name: string; description: string; objective: string; role: string; instructions: string; domain: string;
  personality: Personality; personalityCustom: string | null; creativity: Creativity; language: AgentLanguage;
}
export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface AgentImage { mimeType: "image/png" | "image/jpeg" | "image/webp" | string; base64: string; name: string }
// `images` : images RÉELLEMENT jointes (transmises seulement à un fournisseur qui les accepte). `attachmentContext` : résumé d'une archive ZIP déjà filtré (secrets exclus).
export interface AgentRequest { agent: AgentConfig; conversation: ChatMessage[]; message: string; context?: Record<string, unknown>; images?: AgentImage[]; attachmentContext?: string }
export type AgentResponse =
  | { status: "completed"; reply: string; generationId?: string; metadata?: Record<string, unknown> }
  | { status: "failed"; error: string };

// Contrat à implémenter pour brancher un fournisseur (exécuté UNIQUEMENT côté serveur).
export interface AgentProvider extends HealthCapable {
  readonly id: string;
  readonly supportsVision?: boolean; // vrai seulement si le fournisseur est configuré pour analyser des images
  sendMessage(req: AgentRequest, opts?: { signal?: AbortSignal }): Promise<AgentResponse>;
}
