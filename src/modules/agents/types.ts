import type { AgentConfig } from "@/lib/ai/agents/types";
import type { AgentStatus } from "@/types/database";
export interface AgentInput extends AgentConfig { icon: string; provider: string | null; status: AgentStatus }
export type AgentFormState = { status: "idle" } | { status: "error"; message: string };
// conversationId est renseigné dès que des lignes ont été écrites en base (pour que l'interface s'y positionne).
export type ChatActionState =
  | { status: "error" | "not_configured" | "insufficient_credits"; message: string; conversationId?: string }
  | { status: "success"; conversationId: string };
export interface ChatMessageView { id: string; role: "user" | "assistant"; content: string; status: "pending" | "completed" | "failed"; error: string | null }
