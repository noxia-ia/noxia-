import type { VideoParams, VideoResult, VideoStatus } from "@/lib/ai/video/types";
// Modèle d'affichage commun au résultat et à l'historique (dates en ISO).
export interface VideoDisplay {
  id: string; prompt: string; params: VideoParams | null; status: VideoStatus;
  createdAt: string; completedAt: string | null; error: string | null; result: VideoResult | null;
}
export type VideoActionState =
  | { status: "idle" }
  | { status: "error" | "not_configured" | "insufficient_credits" | "processing"; message: string }
  | { status: "success"; display: VideoDisplay };
