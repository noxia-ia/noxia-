import type { ImageStyle, ImageRatio, ImageQuality, ImageCount, ImageFormat } from "@/lib/ai/image/types";
export { STATUS_LABELS } from "@/lib/generation-status";
export const STYLE_LABELS: Record<ImageStyle, string> = { realistic: "Réaliste", cinematic: "Cinématique", anime: "Anime", "3d": "3D", illustration: "Illustration", painting: "Peinture", dark_fantasy: "Dark fantasy", minimalist: "Minimaliste" };
export const RATIO_LABELS: Record<ImageRatio, string> = { "1:1": "Carré 1:1", "4:5": "Portrait 4:5", "3:4": "Portrait 3:4", "16:9": "Paysage 16:9", "9:16": "Vertical 9:16" };
export const QUALITY_LABELS: Record<ImageQuality, string> = { standard: "Standard", hd: "HD", ultra: "Ultra" };
export const COUNT_LABELS: Record<ImageCount, string> = { 1: "1 image", 2: "2 images", 4: "4 images" };
export const FORMAT_LABELS: Record<ImageFormat, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP" };
export const SUGGESTIONS = [
  "Un château gothique sur une falaise sous une lune rouge, atmosphère mystérieuse et cinématique.",
  "Portrait d'un chevalier en armure noire et argent, éclairage dramatique, détails ultra réalistes.",
  "Une ville futuriste la nuit, néons rouges et pluie, reflets sur l'asphalte.",
  "Un lion majestueux dans une forêt brumeuse au lever du soleil, photographie réaliste.",
];
