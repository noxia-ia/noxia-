import type { ModuleId } from "@/types";
export type ContentPolicyMode = "strict"; // modes futurs à ajouter ici, jamais pilotés par le navigateur
export type BlockReason = "minor_sexual" | "real_person_sexual" | "filter_bypass";
export type ModerationReason = BlockReason | "repeated_attempts";
export interface ModerationInput { module: ModuleId; prompt: string; params?: unknown; context?: string }
export type PolicyResult = { allowed: true } | { allowed: false; reason: BlockReason; internal: string };
export type ModerationResult = { allowed: true } | { allowed: false; reason: ModerationReason; internal: string };
