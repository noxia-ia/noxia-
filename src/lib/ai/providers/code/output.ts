import type { GeneratedFile, GenerateCodeResult } from "@/lib/ai/types";
import { ProviderError } from "@/lib/providers/errors";

// Validation STRICTE de la sortie d'un modèle de code (non fiable). Tout écart → RESULT_INVALID (pas de réparation silencieuse, pas de résultat partiel).
export const MAX_FILES = 50, MAX_FILE_CHARS = 200_000, MAX_TOTAL_CHARS = 1_000_000, MAX_MESSAGE_CHARS = 20_000;
const LANGUAGE_RE = /^[a-z0-9][a-z0-9+#._-]{0,39}$/;
const bad = (why: string) => new ProviderError("RESULT_INVALID", `code_${why}`);

export function isSafePath(p: unknown): p is string {
  if (typeof p !== "string" || p.length === 0 || p.length > 200) return false;
  if (p.startsWith("/") || p.startsWith("./") || p.includes("\\") || p.includes(":") || /[\u0000-\u001f]/.test(p)) return false;
  return p.split("/").every(seg => seg.length > 0 && seg !== "." && seg !== "..");
}

// Extrait l'objet JSON d'une réponse de modèle (avec ou sans bloc ```json) puis valide chaque champ.
export function parseCodeOutput(text: string): GenerateCodeResult {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  let data: unknown;
  try { data = JSON.parse(t); } catch { throw bad("not_json"); }
  const o = data as { message?: unknown; files?: unknown } | null;
  if (!o || typeof o !== "object" || typeof o.message !== "string" || !Array.isArray(o.files)) throw bad("shape");
  if (o.message.length > MAX_MESSAGE_CHARS) throw bad("message_too_long");
  if (o.files.length < 1 || o.files.length > MAX_FILES) throw bad("file_count");
  const seen = new Set<string>();
  let total = 0;
  const files: GeneratedFile[] = o.files.map(f => {
    const x = f as Partial<GeneratedFile> | null;
    if (!x || typeof x !== "object" || !isSafePath(x.path)) throw bad("path");
    if (typeof x.language !== "string" || !LANGUAGE_RE.test(x.language.toLowerCase())) throw bad("language");
    if (typeof x.content !== "string" || !x.content.trim() || x.content.length > MAX_FILE_CHARS) throw bad("content");
    const key = x.path.toLowerCase();
    if (seen.has(key)) throw bad("duplicate_path");
    seen.add(key);
    total += x.content.length;
    return { path: x.path, language: x.language.toLowerCase(), content: x.content };
  });
  if (total > MAX_TOTAL_CHARS) throw bad("total_size");
  return { message: o.message, files };
}
