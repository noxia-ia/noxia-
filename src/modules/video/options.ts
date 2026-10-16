import type { VideoStyle, VideoDuration, VideoFormat, VideoQuality, VideoCamera, VideoMotion } from "@/lib/ai/video/types";
export { STATUS_LABELS } from "@/lib/generation-status";
export const STYLE_LABELS: Record<VideoStyle, string> = { cinematic: "Cinématique", realistic: "Réaliste", anime: "Anime", "3d": "3D", advertising: "Publicitaire", dark: "Sombre", fantasy: "Fantastique" };
export const DURATION_LABELS: Record<VideoDuration, string> = { 5: "5 secondes", 10: "10 secondes", 15: "15 secondes", 30: "30 secondes" };
export const FORMAT_LABELS: Record<VideoFormat, string> = { vertical: "Vertical 9:16", square: "Carré 1:1", horizontal: "Horizontal 16:9" };
export const QUALITY_LABELS: Record<VideoQuality, string> = { standard: "Standard", hd: "HD", ultra: "Ultra" };
export const CAMERA_LABELS: Record<VideoCamera, string> = { static: "Plan fixe", zoom_in: "Zoom avant", zoom_out: "Zoom arrière", tracking: "Travelling", pan: "Panoramique", drone: "Drone", handheld: "Caméra à main", cinematic: "Cinématique" };
export const MOTION_LABELS: Record<VideoMotion, string> = { slow: "Lent", normal: "Normal", dynamic: "Dynamique", very_dynamic: "Très dynamique" };
export const SUGGESTIONS = [
  "Une voiture noire futuriste traverse une ville cyberpunk sous une pluie intense, caméra cinématique.",
  "Un lion majestueux marche lentement dans une forêt brumeuse au lever du soleil.",
  "Une femme marche dans une ville futuriste illuminée par des néons rouges.",
  "Une fusée décolle d'une planète extraterrestre avec une caméra cinématique.",
];
