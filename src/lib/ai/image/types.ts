import type { HealthCapable } from "@/lib/providers/types";
export const IMAGE_STYLES = ["realistic", "cinematic", "anime", "3d", "illustration", "painting", "dark_fantasy", "minimalist"] as const;
export const IMAGE_RATIOS = ["1:1", "4:5", "3:4", "16:9", "9:16"] as const;
export const IMAGE_QUALITIES = ["standard", "hd", "ultra"] as const;
export const IMAGE_COUNTS = [1, 2, 4] as const;
export const IMAGE_FORMATS = ["png", "jpeg", "webp"] as const; // format de fichier
export type ImageStyle = (typeof IMAGE_STYLES)[number];
export type ImageRatio = (typeof IMAGE_RATIOS)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageCount = (typeof IMAGE_COUNTS)[number];
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export type ImageStatus = "pending" | "processing" | "completed" | "failed";

// Structure envoyée à un futur fournisseur IA (et stockée dans generations.params).
export interface ImageParams { style: ImageStyle; ratio: ImageRatio; quality: ImageQuality; count: ImageCount; format: ImageFormat }
// `model` : réservé à un futur choix de modèle, uniquement si un fournisseur « sélectionnable » existe (décidé côté serveur).
export interface ImageRequest extends ImageParams { prompt: string; model?: string; context?: Record<string, unknown> }

export interface ImageAsset { url: string; storedUrl?: string; thumbnailUrl?: string; mimeType: string; width?: number; height?: number }
export interface ImageResult { images: ImageAsset[] }

export type ImageJob =
  | { status: "completed"; result: ImageResult }
  | { status: "processing"; jobId: string }
  | { status: "failed"; error: string };

// Contrat à implémenter pour brancher un fournisseur (exécuté UNIQUEMENT côté serveur).
export interface ImageProvider extends HealthCapable {
  readonly id: string;
  // `userId` et `generationId` viennent du SERVEUR (jamais du navigateur). Un fournisseur qui renvoie des OCTETS (et non une URL HTTPS) en a besoin pour ranger le fichier
  // dans le stockage permanent (chemin lié à l'utilisateur et à la génération) : voir persistBytes() dans src/lib/storage. Les fournisseurs qui renvoient une URL les ignorent.
  generate(req: ImageRequest, opts?: { signal?: AbortSignal; userId?: string; generationId?: string }): Promise<ImageJob>;
  getJob?(jobId: string, opts?: { signal?: AbortSignal }): Promise<ImageJob>; // fournisseurs asynchrones (polling)
}
