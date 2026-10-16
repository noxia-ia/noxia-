import type { GeneratedFile, GenerateCodeResult } from "./types";
const MAX_FILES = 50, MAX_FILE_CHARS = 200_000, MAX_TOTAL_CHARS = 1_000_000, MAX_MESSAGE_CHARS = 20_000;
const safePath = (p: string) => p.length > 0 && p.length <= 200 && !p.startsWith("/") && !p.includes("..") && !p.includes(":") && !p.includes("\\") && !/[\u0000-\u001f]/.test(p);
// Relit défensivement un résultat stocké en base (jsonb).
export function parseStoredResult(v: unknown): GenerateCodeResult | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { message?: unknown; files?: unknown };
  if (typeof o.message !== "string" || !Array.isArray(o.files)) return null;
  const files = o.files.filter((f): f is GeneratedFile => {
    const x = f as Partial<GeneratedFile> | null;
    return !!x && typeof x.path === "string" && safePath(x.path) && typeof x.language === "string" && x.language.length <= 40 && typeof x.content === "string" && x.content.length <= MAX_FILE_CHARS;
  });
  if (o.message.length > MAX_MESSAGE_CHARS || files.length > MAX_FILES || files.reduce((n, f) => n + f.content.length, 0) > MAX_TOTAL_CHARS) return null;
  return { message: o.message, files };
}
