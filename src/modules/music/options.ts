import type { MusicDuration, MusicFormat, MusicMood, MusicStyle } from "@/lib/ai/music/types";
export const STYLE_LABELS: Record<MusicStyle, string> = { cinematic: "Cinématique", afro: "Afro", electronic: "Électronique", lofi: "Lo-fi", classical: "Classique", ambient: "Ambient", pop: "Pop", rock: "Rock", jazz: "Jazz", game: "Jeu vidéo" };
export const MOOD_LABELS: Record<MusicMood, string> = { joyful: "Joyeuse", sad: "Triste", epic: "Épique", relaxing: "Relaxante", dark: "Sombre", romantic: "Romantique", energetic: "Énergique", mysterious: "Mystérieuse" };
export const DURATION_LABELS: Record<MusicDuration, string> = { 15: "15 secondes", 30: "30 secondes", 60: "1 minute", 120: "2 minutes" };
export const FORMAT_LABELS: Record<MusicFormat, string> = { mp3: "MP3", wav: "WAV" };
export const SUGGESTIONS = [
  "Une musique cinématique épique pour l'ouverture d'un film futuriste.",
  "Une musique afro relaxante avec une basse chaleureuse et des percussions douces.",
  "Une ambiance mystérieuse et sombre pour un drama nocturne.",
  "Une musique lofi calme pour travailler pendant une heure.",
];
