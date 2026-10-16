import type { HealthCapable } from "@/lib/providers/types";
export const VIDEO_STYLES = ["cinematic", "realistic", "anime", "3d", "advertising", "dark", "fantasy"] as const;
export const VIDEO_DURATIONS = [5, 10, 15, 30] as const;
export const VIDEO_FORMATS = ["vertical", "square", "horizontal"] as const; // 9:16, 1:1, 16:9
export const VIDEO_QUALITIES = ["standard", "hd", "ultra"] as const;
export const VIDEO_CAMERAS = ["static", "zoom_in", "zoom_out", "tracking", "pan", "drone", "handheld", "cinematic"] as const;
export const VIDEO_MOTIONS = ["slow", "normal", "dynamic", "very_dynamic"] as const;

export type VideoStyle = (typeof VIDEO_STYLES)[number];
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];
export type VideoFormat = (typeof VIDEO_FORMATS)[number];
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];
export type VideoCamera = (typeof VIDEO_CAMERAS)[number];
export type VideoMotion = (typeof VIDEO_MOTIONS)[number];
export type VideoStatus = "pending" | "processing" | "completed" | "failed";

// Structure envoyée à un futur fournisseur IA (et stockée dans generations.params).
export interface VideoParams { style: VideoStyle; durationSeconds: VideoDuration; format: VideoFormat; quality: VideoQuality; camera: VideoCamera; motion: VideoMotion }
export interface VideoRequest extends VideoParams { prompt: string }

export interface VideoAsset { url: string; storedUrl?: string; thumbnailUrl?: string; mimeType: string; durationSeconds?: number; format?: VideoFormat; width?: number; height?: number }
export interface VideoResult { asset: VideoAsset }

// Réponse d'un fournisseur : terminé, en cours (job asynchrone) ou échec.
export type VideoJob =
  | { status: "completed"; result: VideoResult }
  | { status: "processing"; jobId: string }
  | { status: "failed"; error: string };

// Contrat à implémenter pour brancher un fournisseur (exécuté UNIQUEMENT côté serveur).
export interface VideoProvider extends HealthCapable {
  readonly id: string;
  // `userId` et `generationId` viennent du SERVEUR : un fournisseur qui renvoie des OCTETS (et non une URL HTTPS) les utilise pour ranger le fichier (persistBytes).
  generate(req: VideoRequest, opts?: { signal?: AbortSignal; userId?: string; generationId?: string }): Promise<VideoJob>;
  getJob?(jobId: string, opts?: { signal?: AbortSignal }): Promise<VideoJob>; // fournisseurs asynchrones (polling)
}
