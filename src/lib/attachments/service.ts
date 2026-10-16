import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeZip, DEFAULT_ZIP_LIMITS } from "./zip";
import { analyzePdf, DEFAULT_PDF_LIMITS } from "./pdf";
import { analyzeRar, DEFAULT_RAR_LIMITS } from "./rar";
import { sniffType, sanitizeName, type AttachmentKind } from "./sniff";

// Pièces jointes du chat. Tout passe par le SERVEUR : le navigateur n'écrit ni dans la table ni dans le bucket (aucune politique d'écriture).
// Le type est déterminé par les OCTETS (jamais par l'extension ni le type annoncé). Le binaire est supprimé juste après le traitement du message.
export const ATTACHMENT_BUCKET = "noxia-chat-attachments";
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_IMAGES_PER_MESSAGE = 3;
export const MAX_UPLOADS_PER_HOUR = 30;
export const MAX_PENDING_UPLOADS = 8;
const HARD_MAX_MB = 5; // plafond du bucket (migration 0050) ; Netlify limite aussi le corps d'une requête à ~6 Mo

export const attachmentsEnabled = () => process.env.CHAT_ATTACHMENTS_ENABLED?.trim() === "true";
export function maxUploadBytes(): number {
  const mb = Number(process.env.CHAT_ATTACHMENT_MAX_MB);
  return Math.round((Number.isFinite(mb) && mb >= 1 ? Math.min(mb, HARD_MAX_MB) : 4) * 1024 * 1024);
}

export type { AttachmentKind };
export interface AttachmentRow { id: string; user_id: string; kind: AttachmentKind; mime: string; original_name: string; size_bytes: number; storage_path: string | null; message_id: string | null; created_at: string; expires_at: string; purged_at: string | null }
export interface PublicAttachment { id: string; kind: AttachmentKind; name: string; size: number }
const toPublic = (r: AttachmentRow): PublicAttachment => ({ id: r.id, kind: r.kind, name: r.original_name, size: r.size_bytes });

export { sniffType, sanitizeName };

export type UploadResult = { ok: true; attachment: PublicAttachment } | { ok: false; status: number; message: string };
export async function saveUpload(userId: string, file: { name: string; size: number; bytes: () => Promise<Uint8Array> }): Promise<UploadResult> {
  if (!attachmentsEnabled()) return { ok: false, status: 503, message: "Les pièces jointes ne sont pas encore activées." };
  const max = maxUploadBytes();
  if (file.size <= 0) return { ok: false, status: 400, message: "Le fichier est vide." };
  if (file.size > max) return { ok: false, status: 413, message: `Fichier trop volumineux (${Math.round(max / 1024 / 1024)} Mo maximum).` };
  const bytes = await file.bytes();
  if (bytes.byteLength !== file.size || bytes.byteLength > max) return { ok: false, status: 413, message: "Fichier invalide." };
  const type = sniffType(bytes);
  if (!type) return { ok: false, status: 415, message: "Type de fichier non pris en charge. Images (PNG, JPEG, WebP), PDF, ZIP ou RAR uniquement." };
  if (type.kind === "zip") { // refus immédiat (ZIP Slip, bombe, chiffré…) avant tout stockage : l'utilisateur voit le motif tout de suite
    const a = analyzeZip(bytes, { maxArchiveBytes: max });
    if (!a.ok) return { ok: false, status: 422, message: a.message };
  } else if (type.kind === "pdf") {
    const a = analyzePdf(bytes, { ...DEFAULT_PDF_LIMITS, maxBytes: max });
    if (!a.ok) return { ok: false, status: 422, message: a.message };
  } else if (type.kind === "rar") {
    const a = analyzeRar(bytes, { ...DEFAULT_RAR_LIMITS, maxBytes: max });
    if (!a.ok) return { ok: false, status: 422, message: a.message };
  }
  const db = createAdminClient();
  const sinceHour = new Date(Date.now() - 3600_000).toISOString();
  const { count: lastHour } = await db.from("chat_attachments").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinceHour);
  if ((lastHour ?? 0) >= MAX_UPLOADS_PER_HOUR) return { ok: false, status: 429, message: "Trop d'envois de fichiers. Réessaie plus tard." };
  await purgeExpired(userId);
  const { count: pending } = await db.from("chat_attachments").select("id", { count: "exact", head: true }).eq("user_id", userId).is("message_id", null).is("purged_at", null).gt("expires_at", new Date().toISOString());
  if ((pending ?? 0) >= MAX_PENDING_UPLOADS) return { ok: false, status: 429, message: "Trop de fichiers en attente. Envoie ton message ou retire des fichiers." };

  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${type.ext}`; // chemin 100 % construit par le serveur : le nom du fichier n'y entre jamais
  const up = await db.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, { contentType: type.mime, upsert: false });
  if (up.error) return { ok: false, status: 502, message: "Impossible d'enregistrer le fichier. Réessaie." };
  const { data, error } = await db.from("chat_attachments").insert({ id, user_id: userId, kind: type.kind, mime: type.mime, original_name: sanitizeName(file.name), size_bytes: bytes.byteLength, storage_path: path }).select("*").single<AttachmentRow>();
  if (error || !data) { await db.storage.from(ATTACHMENT_BUCKET).remove([path]); return { ok: false, status: 502, message: "Impossible d'enregistrer le fichier. Réessaie." }; }
  return { ok: true, attachment: toPublic(data) };
}

export async function deleteUpload(userId: string, id: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from("chat_attachments").select("*").eq("id", id).eq("user_id", userId).is("message_id", null).maybeSingle<AttachmentRow>();
  if (!data) return false;
  if (data.storage_path) await db.storage.from(ATTACHMENT_BUCKET).remove([data.storage_path]);
  await db.from("chat_attachments").delete().eq("id", id).eq("user_id", userId);
  return true;
}

// Pièces non envoyées après 24 h : supprimées (appelé à chaque nouvel envoi du même utilisateur).
export async function purgeExpired(userId: string): Promise<void> {
  const db = createAdminClient();
  const { data } = await db.from("chat_attachments").select("id,storage_path").eq("user_id", userId).is("message_id", null).lt("expires_at", new Date().toISOString()).limit(50).returns<{ id: string; storage_path: string | null }[]>();
  for (const r of data ?? []) {
    if (r.storage_path) { const rm = await db.storage.from(ATTACHMENT_BUCKET).remove([r.storage_path]); if (rm.error) continue; }
    await db.from("chat_attachments").delete().eq("id", r.id).eq("user_id", userId);
  }
}
// Suppression de compte : à appeler AVANT auth.admin.deleteUser (même règle que removeAllForUser).
export async function removeAllAttachmentsForUser(userId: string): Promise<{ removed: number; failed: number }> {
  const db = createAdminClient();
  const { data } = await db.from("chat_attachments").select("id,storage_path").eq("user_id", userId).not("storage_path", "is", null).returns<{ id: string; storage_path: string }[]>();
  let removed = 0, failed = 0;
  for (const r of data ?? []) { const rm = await db.storage.from(ATTACHMENT_BUCKET).remove([r.storage_path]); if (rm.error) failed++; else removed++; }
  return { removed, failed };
}

// Pièces À ENVOYER avec un message : appartiennent à l'utilisateur, non déjà utilisées, non expirées, en nombre limité. Tout écart → refus (rien n'est débité).
export type ClaimResult = { ok: true; rows: AttachmentRow[] } | { ok: false; message: string };
export async function claimForSend(userId: string, ids: string[]): Promise<ClaimResult> {
  if (!attachmentsEnabled()) return { ok: false, message: "Les pièces jointes ne sont pas encore activées." };
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return { ok: true, rows: [] };
  if (uniq.length > MAX_ATTACHMENTS_PER_MESSAGE) return { ok: false, message: `${MAX_ATTACHMENTS_PER_MESSAGE} pièces jointes maximum par message.` };
  const { data } = await createAdminClient().from("chat_attachments").select("*").in("id", uniq).eq("user_id", userId).is("message_id", null).is("purged_at", null).gt("expires_at", new Date().toISOString()).returns<AttachmentRow[]>();
  const rows = data ?? [];
  if (rows.length !== uniq.length) return { ok: false, message: "Une pièce jointe est introuvable ou expirée. Retire-la et réessaie." };
  if (rows.filter(r => r.kind === "image").length > MAX_IMAGES_PER_MESSAGE) return { ok: false, message: `${MAX_IMAGES_PER_MESSAGE} images maximum par message.` };
  if (rows.filter(r => r.kind === "zip" || r.kind === "rar").length > 1) return { ok: false, message: "Une seule archive (ZIP ou RAR) par message." };
  if (rows.filter(r => r.kind === "pdf").length > 2) return { ok: false, message: "Deux PDF maximum par message." };
  return { ok: true, rows };
}

export interface AttachmentPayload { images: { mimeType: string; base64: string; name: string }[]; archiveDigest: string | null; notes: string[] }
export async function loadPayload(rows: AttachmentRow[]): Promise<{ ok: true; payload: AttachmentPayload } | { ok: false; message: string }> {
  const db = createAdminClient();
  const payload: AttachmentPayload = { images: [], archiveDigest: null, notes: [] };
  const digests: string[] = [];
  for (const r of rows) {
    if (!r.storage_path) return { ok: false, message: "Une pièce jointe n'est plus disponible." };
    const dl = await db.storage.from(ATTACHMENT_BUCKET).download(r.storage_path);
    if (dl.error || !dl.data) return { ok: false, message: "Impossible de lire une pièce jointe. Réessaie." };
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const type = sniffType(bytes); // revérifié à la lecture
    if (!type || type.mime !== r.mime) return { ok: false, message: "Une pièce jointe est invalide." };
    if (r.kind === "image") payload.images.push({ mimeType: r.mime, base64: Buffer.from(bytes).toString("base64"), name: r.original_name });
    else if (r.kind === "zip") {
      const a = analyzeZip(bytes, { ...DEFAULT_ZIP_LIMITS, maxArchiveBytes: maxUploadBytes() });
      if (!a.ok) return { ok: false, message: a.message };
      digests.push(`Nom de l'archive : ${r.original_name}\n${a.digest}`);
    } else if (r.kind === "pdf") {
      const a = analyzePdf(bytes, { ...DEFAULT_PDF_LIMITS, maxBytes: maxUploadBytes() });
      if (!a.ok) return { ok: false, message: a.message };
      digests.push(`Nom du PDF : ${r.original_name}\n${a.digest}`);
    } else if (r.kind === "rar") {
      const a = analyzeRar(bytes, { ...DEFAULT_RAR_LIMITS, maxBytes: maxUploadBytes() });
      if (!a.ok) return { ok: false, message: a.message };
      digests.push(`Nom de l'archive RAR : ${r.original_name}\n${a.digest}`);
    }
  }
  if (digests.length) payload.archiveDigest = digests.join("\n\n---\n\n");
  return { ok: true, payload };
}

// Après traitement (succès OU échec) : rattache les pièces au message et SUPPRIME les binaires ; seules les métadonnées restent.
export async function finishAttachments(userId: string, rows: AttachmentRow[], messageId: string | null): Promise<void> {
  if (rows.length === 0) return;
  const db = createAdminClient();
  const paths = rows.map(r => r.storage_path).filter((p): p is string => !!p);
  const removed = paths.length ? await db.storage.from(ATTACHMENT_BUCKET).remove(paths) : { error: null };
  await db.from("chat_attachments").update({ message_id: messageId, ...(removed.error ? {} : { storage_path: null, purged_at: new Date().toISOString() }) }).in("id", rows.map(r => r.id)).eq("user_id", userId);
}
