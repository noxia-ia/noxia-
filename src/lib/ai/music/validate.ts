import { MUSIC_DURATIONS, MUSIC_FORMATS, MUSIC_MOODS, MUSIC_STYLES, type MusicParams, type MusicRequest, type MusicResult } from "./types";
import { PROMPT_MAX, PROMPT_MIN } from "@/modules/music/config";
import { ALLOWED_MIME_EXT } from "@/lib/storage/policy";

const inList = <T extends readonly (string | number)[]>(list: T, v: unknown): v is T[number] => (list as readonly unknown[]).includes(v);
const positive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;

export function parseMusicParams(v: unknown): MusicParams | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!inList(MUSIC_STYLES, o.style) || !inList(MUSIC_MOODS, o.mood) || !inList(MUSIC_DURATIONS, o.durationSeconds) || !inList(MUSIC_FORMATS, o.format) || typeof o.instrumental !== "boolean") return null;
  const bpm = o.bpm === undefined || o.bpm === null || o.bpm === "" ? undefined : Number(o.bpm);
  if (bpm !== undefined && (!Number.isInteger(bpm) || bpm < 40 || bpm > 220)) return null;
  const instruments = o.instruments === undefined || o.instruments === null ? undefined : String(o.instruments).trim().slice(0, 500);
  return { style: o.style, mood: o.mood, durationSeconds: o.durationSeconds, format: o.format, instrumental: o.instrumental, bpm, instruments: instruments || undefined };
}

export function parseMusicForm(fd: FormData): { ok: true; req: MusicRequest } | { ok: false; error: string } {
  const prompt = String(fd.get("prompt") ?? "").trim();
  if (prompt.length < PROMPT_MIN) return { ok: false, error: "Décris la musique en quelques mots de plus." };
  if (prompt.length > PROMPT_MAX) return { ok: false, error: `Ta description est trop longue (${PROMPT_MAX} caractères maximum).` };
  const params = parseMusicParams({
    style: fd.get("style"), mood: fd.get("mood"), durationSeconds: Number(fd.get("duration")), format: fd.get("format"),
    bpm: fd.get("bpm"), instruments: fd.get("instruments"), instrumental: fd.get("instrumental") === "on",
  });
  if (!params) return { ok: false, error: "Paramètres musicaux invalides." };
  return { ok: true, req: { prompt, ...params } };
}

export function parseMusicResult(v: unknown): MusicResult | null {
  const a = (v as { asset?: unknown } | null)?.asset as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object" || typeof a.mimeType !== "string" || !a.mimeType.startsWith("audio/") || !ALLOWED_MIME_EXT[a.mimeType]) return null;
  const hasUrl = typeof a.url === "string" && /^https:\/\//.test(a.url);
  const hasStored = typeof a.storedUrl === "string" && (/^https:\/\//.test(a.storedUrl) || /^\/api\/media\//.test(a.storedUrl));
  const hasBytes = a.bytes instanceof Uint8Array;
  if (!hasUrl && !hasStored && !hasBytes) return null;
  if (hasBytes && a.mimeType !== "audio/mpeg" && a.mimeType !== "audio/wav" && a.mimeType !== "audio/x-wav") return null;
  return { asset: { url: hasUrl ? a.url as string : undefined, storedUrl: hasStored ? a.storedUrl as string : undefined, mimeType: a.mimeType, durationSeconds: positive(a.durationSeconds) ? a.durationSeconds as number : undefined } };
}
