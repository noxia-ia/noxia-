import type { HealthCapable } from "@/lib/providers/types";
export const ASMR_TYPES = ["video", "audio", "image"] as const;
export const ASMR_STYLES = ["soft", "satisfying", "relaxing", "intense", "ultra_realistic"] as const;
export const ASMR_AMBIANCES = ["studio", "nature", "kitchen", "laboratory", "luxury", "dark"] as const;
export const ASMR_DURATIONS = [5, 10, 15] as const;
export const ASMR_FORMATS = ["vertical", "square", "horizontal"] as const; // 9:16, 1:1, 16:9

export type ASMRType = (typeof ASMR_TYPES)[number];
export type ASMRStyle = (typeof ASMR_STYLES)[number];
export type ASMRAmbiance = (typeof ASMR_AMBIANCES)[number];
export type ASMRDuration = (typeof ASMR_DURATIONS)[number];
export type ASMRFormat = (typeof ASMR_FORMATS)[number];
export type ASMRStatus = "pending" | "processing" | "completed" | "failed";

// Structure envoyée à un futur fournisseur IA (et stockée dans generations.params).
export interface ASMRParams { type: ASMRType; style: ASMRStyle; ambiance: ASMRAmbiance; durationSeconds: ASMRDuration; format: ASMRFormat }
export interface ASMRRequest extends ASMRParams { prompt: string }

export interface ASMRAsset { kind: ASMRType; url?: string; storedUrl?: string; mimeType: string; durationSeconds?: number; width?: number; height?: number; bytes?: Uint8Array; extension?: "mp3" | "wav" | "ogg" | "m4a" }
export interface ASMRResult { asset: ASMRAsset }

// Réponse d'un fournisseur : terminé, en cours (travail asynchrone) ou échec.
export type ASMRJob =
  | { status: "completed"; result: ASMRResult }
  | { status: "processing"; jobId: string }
  | { status: "failed"; error: string };

// Contrat à implémenter pour brancher un fournisseur (exécuté UNIQUEMENT côté serveur).
export interface ASMRProvider extends HealthCapable {
  readonly id: string;
  // `userId` et `generationId` viennent du SERVEUR : un fournisseur qui renvoie des OCTETS (et non une URL HTTPS) les utilise pour ranger le fichier (persistBytes).
  generate(req: ASMRRequest, opts?: { signal?: AbortSignal; userId?: string; generationId?: string }): Promise<ASMRJob>;
  getJob?(jobId: string, opts?: { signal?: AbortSignal }): Promise<ASMRJob>; // pour les fournisseurs asynchrones
}
