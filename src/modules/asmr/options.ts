import type { ASMRType, ASMRStyle, ASMRAmbiance, ASMRDuration, ASMRFormat } from "@/lib/ai/asmr/types";
export const TYPE_LABELS: Record<ASMRType, string> = { video: "Vidéo ASMR", audio: "Audio ASMR", image: "Image ASMR" };
export const STYLE_LABELS: Record<ASMRStyle, string> = { soft: "Doux", satisfying: "Satisfaisant", relaxing: "Relaxant", intense: "Intense", ultra_realistic: "Ultra réaliste" };
export const AMBIANCE_LABELS: Record<ASMRAmbiance, string> = { studio: "Studio", nature: "Nature", kitchen: "Cuisine", laboratory: "Laboratoire", luxury: "Luxe", dark: "Sombre" };
export const DURATION_LABELS: Record<ASMRDuration, string> = { 5: "5 secondes", 10: "10 secondes", 15: "15 secondes" };
export const FORMAT_LABELS: Record<ASMRFormat, string> = { vertical: "Vertical 9:16", square: "Carré 1:1", horizontal: "Horizontal 16:9" };
export { STATUS_LABELS } from "@/lib/generation-status";
export const SUGGESTIONS = [
  "Couper lentement une pomme en verre avec un couteau extrêmement précis.",
  "Verser du miel épais dans un récipient en verre.",
  "Marcher lentement sur de la neige fraîche.",
  "Écraser délicatement des cristaux transparents.",
  "Couper un objet en cristal avec des sons très réalistes.",
  "Verser de l'eau sur une surface métallique.",
];
