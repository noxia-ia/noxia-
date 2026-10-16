import { ASMR_TYPES, ASMR_STYLES, ASMR_AMBIANCES, ASMR_DURATIONS, ASMR_FORMATS, type ASMRParams, type ASMRRequest, type ASMRResult } from "./types";
import { PROMPT_MIN, PROMPT_MAX } from "@/modules/asmr/config";

const inList = <T extends readonly (string | number)[]>(list: T, v: unknown): v is T[number] => (list as readonly unknown[]).includes(v);
const isHttps = (s: string) => { try { return new URL(s).protocol === "https:"; } catch { return false; } };
const pos = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);

export function parseASMRParams(v: unknown): ASMRParams | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if ((o.type !== "video" && o.type !== "audio") || !inList(ASMR_STYLES, o.style) || !inList(ASMR_AMBIANCES, o.ambiance)
    || !inList(ASMR_DURATIONS, o.durationSeconds) || !inList(ASMR_FORMATS, o.format)) return null;
  return { type: o.type, style: o.style, ambiance: o.ambiance, durationSeconds: o.durationSeconds, format: o.format };
}

export function parseASMRForm(fd: FormData): { ok: true; req: ASMRRequest } | { ok: false; error: string } {
  const prompt = String(fd.get("prompt") ?? "").trim();
  if (prompt.length < PROMPT_MIN) return { ok: false, error: "Décris ta scène en quelques mots de plus." };
  if (prompt.length > PROMPT_MAX) return { ok: false, error: `Ta description est trop longue (${PROMPT_MAX} caractères maximum).` };
  const params = parseASMRParams({ type: fd.get("type"), style: fd.get("style"), ambiance: fd.get("ambiance"), durationSeconds: Number(fd.get("duration")), format: fd.get("format") });
  if (!params) return { ok: false, error: "Paramètres invalides. ASMR est disponible en vidéo ou en audio." };
  return { ok: true, req: { prompt, ...params } };
}

// Valide un résultat (fournisseur ou base) : seul un média servi en HTTPS, au type cohérent, est accepté.
export function parseASMRResult(v: unknown): ASMRResult | null {
  const a = (v as { asset?: unknown } | null)?.asset as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return null;
  if (!inList(ASMR_TYPES, a.kind) || typeof a.mimeType !== "string") return null;
  const hasUrl = typeof a.url === "string";
  const hasStoredUrl = typeof a.storedUrl === "string";
  const hasBytes = a.bytes instanceof Uint8Array;
  if (!hasUrl && !hasStoredUrl && !hasBytes) return null;
  if (typeof a.url === "string" && !isHttps(a.url)) return null;
  if (typeof a.storedUrl === "string" && !(/^https:\/\//.test(a.storedUrl) || /^\/api\/media\//.test(a.storedUrl))) return null;
  if (!a.mimeType.startsWith(`${a.kind}/`)) return null;
  if (hasBytes && a.kind !== "audio") return null;
  return { asset: { kind: a.kind, url: typeof a.url === "string" && isHttps(a.url) ? a.url : undefined, storedUrl: typeof a.storedUrl === "string" && (/^https:\/\//.test(a.storedUrl) || /^\/api\/media\//.test(a.storedUrl)) ? a.storedUrl : undefined, mimeType: a.mimeType, durationSeconds: pos(a.durationSeconds), width: pos(a.width), height: pos(a.height) } };
}
