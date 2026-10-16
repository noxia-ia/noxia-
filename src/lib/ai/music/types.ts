import type { HealthCapable } from "@/lib/providers/types";

export const MUSIC_STYLES = ["cinematic", "afro", "electronic", "lofi", "classical", "ambient", "pop", "rock", "jazz", "game"] as const;
export const MUSIC_MOODS = ["joyful", "sad", "epic", "relaxing", "dark", "romantic", "energetic", "mysterious"] as const;
export const MUSIC_DURATIONS = [15, 30, 60, 120] as const;
export const MUSIC_FORMATS = ["mp3", "wav"] as const;

export type MusicStyle = (typeof MUSIC_STYLES)[number];
export type MusicMood = (typeof MUSIC_MOODS)[number];
export type MusicDuration = (typeof MUSIC_DURATIONS)[number];
export type MusicFormat = (typeof MUSIC_FORMATS)[number];
export type MusicStatus = "pending" | "processing" | "completed" | "failed";

export interface MusicParams {
  style: MusicStyle;
  mood: MusicMood;
  durationSeconds: MusicDuration;
  format: MusicFormat;
  bpm?: number;
  instruments?: string;
  instrumental: boolean;
}
export interface MusicRequest extends MusicParams { prompt: string }
export interface MusicAsset { url?: string; storedUrl?: string; mimeType: string; durationSeconds?: number; bytes?: Uint8Array; extension?: "mp3" | "wav" }
export interface MusicResult { asset: MusicAsset }
export type MusicJob =
  | { status: "completed"; result: MusicResult }
  | { status: "processing"; jobId: string }
  | { status: "failed"; error: string };

export interface MusicProvider extends HealthCapable {
  readonly id: string;
  generate(req: MusicRequest, opts?: { signal?: AbortSignal }): Promise<MusicJob>;
  getJob?(jobId: string, opts?: { signal?: AbortSignal }): Promise<MusicJob>;
}
