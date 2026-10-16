import { VIDEO_STYLES, VIDEO_DURATIONS, VIDEO_FORMATS, VIDEO_QUALITIES, VIDEO_CAMERAS, VIDEO_MOTIONS, type VideoParams, type VideoRequest, type VideoResult } from "./types";
import { PROMPT_MIN, PROMPT_MAX } from "@/modules/video/config";
import { ALLOWED_MIME_EXT } from "@/lib/storage/policy";

const inList = <T extends readonly (string | number)[]>(list: T, v: unknown): v is T[number] => (list as readonly unknown[]).includes(v);
const isHttps = (s: unknown): s is string => { if (typeof s !== "string") return false; if (s.startsWith("/api/media/")) return true; try { return new URL(s).protocol === "https:"; } catch { return false; } };
const pos = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);

export function parseVideoParams(v: unknown): VideoParams | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!inList(VIDEO_STYLES, o.style) || !inList(VIDEO_DURATIONS, o.durationSeconds) || !inList(VIDEO_FORMATS, o.format)
    || !inList(VIDEO_QUALITIES, o.quality) || !inList(VIDEO_CAMERAS, o.camera) || !inList(VIDEO_MOTIONS, o.motion)) return null;
  return { style: o.style, durationSeconds: o.durationSeconds, format: o.format, quality: o.quality, camera: o.camera, motion: o.motion };
}

export function parseVideoForm(fd: FormData): { ok: true; req: VideoRequest } | { ok: false; error: string } {
  const prompt = String(fd.get("prompt") ?? "").trim();
  if (prompt.length < PROMPT_MIN) return { ok: false, error: "Décris ta vidéo en quelques mots de plus." };
  if (prompt.length > PROMPT_MAX) return { ok: false, error: `Ta description est trop longue (${PROMPT_MAX} caractères maximum).` };
  const params = parseVideoParams({ style: fd.get("style"), durationSeconds: Number(fd.get("duration")), format: fd.get("format"), quality: fd.get("quality"), camera: fd.get("camera"), motion: fd.get("motion") });
  if (!params) return { ok: false, error: "Paramètres invalides." };
  return { ok: true, req: { prompt, ...params } };
}

// Valide un résultat (fournisseur ou base) : vidéo servie en HTTPS, type « video/* » ; miniature HTTPS sinon ignorée.
export function parseVideoResult(v: unknown): VideoResult | null {
  const a = (v as { asset?: unknown } | null)?.asset as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return null;
  if (!isHttps(a.url) || typeof a.mimeType !== "string" || !a.mimeType.startsWith("video/") || !ALLOWED_MIME_EXT[a.mimeType]) return null;
  return { asset: {
    url: a.url, storedUrl: isHttps(a.storedUrl) ? a.storedUrl : undefined, mimeType: a.mimeType, thumbnailUrl: isHttps(a.thumbnailUrl) ? a.thumbnailUrl : undefined,
    durationSeconds: pos(a.durationSeconds), format: inList(VIDEO_FORMATS, a.format) ? a.format : undefined, width: pos(a.width), height: pos(a.height),
  } };
}
