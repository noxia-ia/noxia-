import { IMAGE_STYLES, IMAGE_RATIOS, IMAGE_QUALITIES, IMAGE_COUNTS, IMAGE_FORMATS, type ImageParams, type ImageRequest, type ImageResult, type ImageAsset } from "./types";
import { PROMPT_MIN, PROMPT_MAX } from "@/modules/image/config";

const inList = <T extends readonly (string | number)[]>(list: T, v: unknown): v is T[number] => (list as readonly unknown[]).includes(v);
const isHttps = (s: unknown): s is string => { if (typeof s !== "string") return false; if (s.startsWith("/api/media/image?path=")) return true; /* image conservée par NOXIA (route protégée) */ try { return new URL(s).protocol === "https:"; } catch { return false; } };
const pos = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 && x <= 20000 ? x : undefined);
const ALLOWED_MIME: readonly string[] = IMAGE_FORMATS.map(f => `image/${f}`); // pas de SVG : il peut contenir du script

export function parseImageParams(v: unknown): ImageParams | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!inList(IMAGE_STYLES, o.style) || !inList(IMAGE_RATIOS, o.ratio) || !inList(IMAGE_QUALITIES, o.quality) || !inList(IMAGE_COUNTS, o.count) || !inList(IMAGE_FORMATS, o.format)) return null;
  return { style: o.style, ratio: o.ratio, quality: o.quality, count: o.count, format: o.format };
}

export function parseImageForm(fd: FormData): { ok: true; req: ImageRequest } | { ok: false; error: string } {
  const prompt = String(fd.get("prompt") ?? "").trim();
  if (prompt.length < PROMPT_MIN) return { ok: false, error: "Décris ton image en quelques mots de plus." };
  if (prompt.length > PROMPT_MAX) return { ok: false, error: `Ta description est trop longue (${PROMPT_MAX} caractères maximum).` };
  const params = parseImageParams({ style: fd.get("style"), ratio: fd.get("ratio"), quality: fd.get("quality"), count: Number(fd.get("count")), format: fd.get("format") });
  if (!params) return { ok: false, error: "Paramètres invalides." };
  return { ok: true, req: { prompt, ...params } };
}

// Valide un résultat (fournisseur ou base) : 1 à maxCount images, URL HTTPS, type d'image autorisé ; miniature HTTPS sinon ignorée.
export function parseImageResult(v: unknown, maxCount: number = 4): ImageResult | null {
  const arr = (v as { images?: unknown } | null)?.images;
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > maxCount) return null;
  const images: ImageAsset[] = [];
  for (const item of arr) {
    const a = item as Record<string, unknown> | null;
    if (!a || typeof a !== "object" || !isHttps(a.url) || typeof a.mimeType !== "string" || !ALLOWED_MIME.includes(a.mimeType)) return null;
    images.push({ url: a.url, storedUrl: isHttps(a.storedUrl) ? a.storedUrl : undefined, mimeType: a.mimeType, thumbnailUrl: isHttps(a.thumbnailUrl) ? a.thumbnailUrl : undefined, width: pos(a.width), height: pos(a.height) });
  }
  return { images };
}
