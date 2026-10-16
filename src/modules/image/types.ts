import type { ImageParams, ImageResult, ImageStatus } from "@/lib/ai/image/types";
export interface ImageDisplay {
  id: string; prompt: string; params: ImageParams | null; status: ImageStatus;
  createdAt: string; completedAt: string | null; error: string | null; result: ImageResult | null;
}
export type ImageActionState =
  | { status: "idle" }
  | { status: "error" | "not_configured" | "insufficient_credits" | "processing"; message: string }
  | { status: "success"; display: ImageDisplay };
