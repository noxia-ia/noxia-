// Utilitaires 100 % navigateur pour le menu « + » (aucun import serveur).
// Le serveur reste l'autorité : il identifie le type par les OCTETS et refuse ce qu'il ne gère pas. Ici on ne fait que guider l'utilisateur.

export type PickKind = "image" | "zip" | "pdf" | "rar";

// Aligné sur src/lib/attachments/sniff.ts (PNG, JPEG, WebP, ZIP, PDF, RAR).
export const SERVER_SUPPORT: Record<PickKind, boolean> = {
  image: true,
  zip: true,
  pdf: true,
  rar: true, // accepté + résumé ; contenu non extrait (format propriétaire)
};

export const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
export const FILE_ACCEPT =
  ".zip,.rar,.pdf,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,application/pdf";

export function classifyFile(f: { name: string; type: string }): PickKind | null {
  const n = f.name.toLowerCase();
  if (IMAGE_MIME.includes(f.type) || /\.(png|jpe?g|webp)$/.test(n)) return "image";
  if (/\.zip$/.test(n) || f.type === "application/zip" || f.type === "application/x-zip-compressed") return "zip";
  if (/\.rar$/.test(n) || f.type === "application/vnd.rar" || f.type === "application/x-rar-compressed") return "rar";
  if (/\.pdf$/.test(n) || f.type === "application/pdf") return "pdf";
  return null;
}

export const UNSUPPORTED_MESSAGE: Record<PickKind, string> = {
  image: "Format d'image non pris en charge (PNG, JPEG ou WebP).",
  zip: "Archive ZIP attendue.",
  pdf: "PDF non pris en charge pour le moment.",
  rar: "Archive RAR non prise en charge pour le moment.",
};

// ── Dossier → ZIP (méthode « stockée », sans compression) ─────────────────────────────────────────
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv", ".idea", ".vscode", "coverage",
]);
const SKIP_FILES = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx|exe|dll|so|dylib|bin|class|jar))$/i;

let CRC_TABLE: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  CRC_TABLE = t;
  return t;
}
export function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u16(v: DataView, o: number, n: number) { v.setUint16(o, n, true); }
function u32(v: DataView, o: number, n: number) { v.setUint32(o, n, true); }

export interface FolderEntry {
  path: string;
  data: Uint8Array;
}

export function buildStoredZip(entries: FolderEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = new TextEncoder().encode(e.path.replace(/^\/+/, "").replace(/\\/g, "/"));
    const size = e.data.length;
    const crc = crc32(e.data);
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, 0); u16(lv, 12, 0x21);
    u32(lv, 14, crc); u32(lv, 18, size); u32(lv, 22, size); u16(lv, 26, name.length); u16(lv, 28, 0);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, 0);
    u16(cv, 14, 0x21); u32(cv, 16, crc); u32(cv, 20, size); u32(cv, 24, size); u16(cv, 28, name.length); u32(cv, 42, offset);
    ch.set(name, 46);
    parts.push(lh, e.data);
    central.push(ch);
    offset += lh.length + size;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, entries.length); u16(ev, 10, entries.length); u32(ev, 12, cdSize); u32(ev, 16, offset);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const c of [...parts, ...central, end]) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export type FolderResult =
  | { ok: true; file: File; kept: number; skipped: number }
  | { ok: false; message: string };

export async function folderToZip(files: File[], maxBytes: number): Promise<FolderResult> {
  if (files.length === 0) return { ok: false, message: "Dossier vide." };
  const rel = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const root = rel(files[0]).split("/")[0] || "dossier";
  const entries: FolderEntry[] = [];
  let skipped = 0;
  let total = 0;
  for (const f of files) {
    const path = rel(f).replace(/\\/g, "/");
    if (path.split("/").some((seg) => SKIP_DIRS.has(seg)) || SKIP_FILES.test(path)) {
      skipped++;
      continue;
    }
    total += f.size;
    if (total > maxBytes * 2) {
      return { ok: false, message: `Dossier trop volumineux (${Math.round(maxBytes / 1024 / 1024)} Mo maximum une fois nettoyé).` };
    }
    entries.push({ path, data: new Uint8Array(await f.arrayBuffer()) });
  }
  if (entries.length === 0) return { ok: false, message: "Ce dossier ne contient aucun fichier utilisable." };
  const zip = buildStoredZip(entries);
  if (zip.length > maxBytes) {
    return { ok: false, message: `Dossier trop volumineux (${Math.round(maxBytes / 1024 / 1024)} Mo maximum).` };
  }
  const buf = new ArrayBuffer(zip.length);
  new Uint8Array(buf).set(zip);
  return { ok: true, file: new File([buf], `${root}.zip`, { type: "application/zip" }), kept: entries.length, skipped };
}
