import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";
import { sanitizeName } from "./sniff";

// Génération à la volée de fichiers ZIP / PDF demandés par l'IA, stockés dans un bucket privé
// via la clé admin (aucune écriture navigateur). Téléchargement uniquement via route signée / API médiatisée.

export const GENERATED_BUCKET = "noxia-chat-generated";
export const MAX_GENERATED_BYTES = 4 * 1024 * 1024; // 4 Mo
export const GENERATED_TTL_HOURS = 24;

export type GeneratedKind = "zip" | "pdf";

export interface GeneratedFileMeta {
  id: string;
  userId: string;
  kind: GeneratedKind;
  name: string;
  size: number;
  storagePath: string;
  expiresAt: string;
}

// ── CRC32 + ZIP stocké (même algo que le client folderToZip) ─────────────────────────────────────

function crcTable(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC_TABLE = crcTable();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v: DataView, o: number, n: number) { v.setUint16(o, n, true); }
function u32(v: DataView, o: number, n: number) { v.setUint32(o, n, true); }

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/** Construit une archive ZIP méthode « stored » (sans compression). */
export function buildStoredZip(entries: ZipEntry[]): Uint8Array {
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
  for (const c of [...parts, ...central, end]) { out.set(c, p); p += c.length; }
  return out;
}

// ── PDF texte minimal (1 page ou multi-pages simples) ───────────────────────────────────────────

function escapePdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Génère un PDF basique (Helvetica, texte ASCII/latin1) à partir de lignes.
 * Suffisant pour livrer un document généré par l'IA sans dépendance externe.
 */
export function buildSimplePdf(title: string, lines: string[], opts?: { fontSize?: number; margin?: number }): Uint8Array {
  const fontSize = opts?.fontSize ?? 11;
  const margin = opts?.margin ?? 50;
  const pageWidth = 595; // A4
  const pageHeight = 842;
  const lineHeight = fontSize * 1.35;
  const maxLinesPerPage = Math.floor((pageHeight - 2 * margin) / lineHeight);

  const pages: string[][] = [];
  let current: string[] = [];
  for (const raw of lines) {
    const line = raw.slice(0, 200);
    if (current.length >= maxLinesPerPage) {
      pages.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) pages.push(current);
  if (pages.length === 0) pages.push([""]);

  const objects: string[] = [];
  const add = (s: string) => { objects.push(s); return objects.length; };

  // 1: Catalog
  add("<< /Type /Catalog /Pages 2 0 R >>");
  // 2: Pages (kids filled later)
  const kids: string[] = [];
  const contentIds: number[] = [];
  const pageIds: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    const contentId = objects.length + 1 + pages.length; // reserved later
    contentIds.push(0); // placeholder
    pageIds.push(0);
  }

  // Rebuild cleanly
  const objs: (string | null)[] = [null]; // 1-indexed
  objs.push("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  // pages object at 2
  const pageObjStart = 3;
  for (let i = 0; i < pages.length; i++) {
    const contentObjNum = pageObjStart + pages.length + i;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${pageObjStart + 2 * pages.length} 0 R >> >> >>`
    );
  }
  // content streams
  for (const pageLines of pages) {
    let y = pageHeight - margin;
    const ops: string[] = ["BT", `/F1 ${fontSize} Tf`, `${margin} ${y} Td`];
    for (let li = 0; li < pageLines.length; li++) {
      if (li > 0) ops.push(`0 ${-lineHeight} Td`);
      ops.push(`(${escapePdfText(pageLines[li])}) Tj`);
    }
    ops.push("ET");
    const stream = ops.join("\n");
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  // Font
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  // Fix pages kids
  const kidRefs = [];
  for (let i = 0; i < pages.length; i++) kidRefs.push(`${pageObjStart + i} 0 R`);
  objs[2] = `<< /Type /Pages /Kids [${kidRefs.join(" ")}] /Count ${pages.length} >>`;

  // Serialize
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

// ── Persistance sécurisée ───────────────────────────────────────────────────────────────────────

export type GenerateResult =
  | { ok: true; id: string; name: string; kind: GeneratedKind; size: number; downloadPath: string }
  | { ok: false; message: string };

/**
 * Crée un ZIP ou un PDF, l'uploade dans le bucket privé, enregistre la métadonnée.
 * Retourne un chemin de téléchargement médiatisé (jamais d'URL publique signée longue durée).
 */
export async function generateAndStore(
  userId: string,
  kind: GeneratedKind,
  name: string,
  payload: { entries?: ZipEntry[]; lines?: string[]; title?: string }
): Promise<GenerateResult> {
  const safeName = sanitizeName(name);
  let bytes: Uint8Array;
  let mime: string;
  let finalName: string;

  if (kind === "zip") {
    const entries = payload.entries ?? [];
    if (entries.length === 0) return { ok: false, message: "ZIP vide." };
    let total = 0;
    for (const e of entries) {
      total += e.data.byteLength;
      if (total > MAX_GENERATED_BYTES) return { ok: false, message: "Contenu trop volumineux pour un ZIP généré." };
    }
    bytes = buildStoredZip(entries);
    mime = "application/zip";
    finalName = safeName.endsWith(".zip") ? safeName : `${safeName}.zip`;
  } else {
    const lines = payload.lines ?? [];
    if (lines.length === 0) return { ok: false, message: "PDF vide." };
    bytes = buildSimplePdf(payload.title || safeName, lines);
    if (bytes.byteLength > MAX_GENERATED_BYTES) return { ok: false, message: "PDF trop volumineux." };
    mime = "application/pdf";
    finalName = safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`;
  }

  if (bytes.byteLength > MAX_GENERATED_BYTES) {
    return { ok: false, message: `Fichier généré trop volumineux (${Math.round(MAX_GENERATED_BYTES / 1024 / 1024)} Mo max).` };
  }

  const id = randomUUID();
  const storagePath = `${userId}/${id}/${finalName}`;
  const db = createAdminClient();

  const up = await db.storage.from(GENERATED_BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (up.error) {
    return { ok: false, message: "Impossible d'enregistrer le fichier généré." };
  }

  const expiresAt = new Date(Date.now() + GENERATED_TTL_HOURS * 3600_000).toISOString();
  const { error: insErr } = await db.from("chat_generated_files").insert({
    id,
    user_id: userId,
    kind,
    original_name: finalName,
    size_bytes: bytes.byteLength,
    storage_path: storagePath,
    expires_at: expiresAt,
  });

  if (insErr) {
    await db.storage.from(GENERATED_BUCKET).remove([storagePath]).catch(() => undefined);
    return { ok: false, message: "Impossible d'enregistrer les métadonnées du fichier." };
  }

  return {
    ok: true,
    id,
    name: finalName,
    kind,
    size: bytes.byteLength,
    downloadPath: `/api/chat/generated?id=${id}`,
  };
}

/** Téléchargement sécurisé : vérifie propriétaire + non expiré, stream le fichier, optionnellement purge. */
export async function downloadGenerated(
  userId: string,
  fileId: string
): Promise<{ ok: true; bytes: Uint8Array; name: string; mime: string } | { ok: false; status: number; message: string }> {
  const db = createAdminClient();
  const { data: row, error } = await db
    .from("chat_generated_files")
    .select("id, user_id, kind, original_name, storage_path, expires_at, purged_at")
    .eq("id", fileId)
    .maybeSingle();

  if (error || !row) return { ok: false, status: 404, message: "Fichier introuvable." };
  if (row.user_id !== userId) return { ok: false, status: 403, message: "Accès refusé." };
  if (row.purged_at) return { ok: false, status: 410, message: "Fichier déjà supprimé." };
  if (new Date(row.expires_at) < new Date()) return { ok: false, status: 410, message: "Fichier expiré." };
  if (!row.storage_path) return { ok: false, status: 410, message: "Fichier indisponible." };

  const dl = await db.storage.from(GENERATED_BUCKET).download(row.storage_path);
  if (dl.error || !dl.data) return { ok: false, status: 404, message: "Contenu introuvable." };

  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const mime = row.kind === "pdf" ? "application/pdf" : "application/zip";
  return { ok: true, bytes, name: row.original_name, mime };
}
