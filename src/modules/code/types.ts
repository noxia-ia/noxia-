import type { GenerateCodeResult } from "@/lib/ai/types";
import type { GenerationStatus } from "@/types/database";
export type CodeActionState =
  | { status: "idle" }
  | { status: "error" | "not_configured" | "insufficient_credits"; message: string }
  | { status: "success"; result: GenerateCodeResult; generationId: string };
export interface HistoryItem {
  id: string; prompt: string | null; status: GenerationStatus; credits_used: number; created_at: string;
  project_type: string | null; technology: string | null; result: GenerateCodeResult | null;
}
