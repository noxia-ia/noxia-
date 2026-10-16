import type { MusicParams, MusicResult, MusicStatus } from "@/lib/ai/music/types";
export interface MusicDisplay { id: string; prompt: string; params: MusicParams | null; status: MusicStatus; createdAt: string; completedAt: string | null; error: string | null; result: MusicResult | null }
export type MusicActionState = { status: "idle" } | { status: "error" | "not_configured" | "insufficient_credits" | "processing"; message: string } | { status: "success"; display: MusicDisplay };
