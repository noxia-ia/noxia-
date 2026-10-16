import type { ASMRParams, ASMRResult, ASMRStatus } from "@/lib/ai/asmr/types";
// Modèle d'affichage commun au résultat et à l'historique (dates en ISO).
export interface ASMRDisplay {
  id: string; prompt: string; params: ASMRParams | null; status: ASMRStatus;
  createdAt: string; completedAt: string | null; error: string | null; result: ASMRResult | null;
}
export type ASMRActionState =
  | { status: "idle" }
  | { status: "error" | "not_configured" | "insufficient_credits" | "processing"; message: string }
  | { status: "success"; display: ASMRDisplay };
