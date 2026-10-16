import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadValidated } from "./download";
import { ALLOWED_MIME_EXT, MAX_BYTES, RETENTION_DAYS, kindOf, matchesMagic } from "./policy";
import { SupabaseStorage } from "./supabase-storage";

// Stockage permanent des octets côté serveur. Les images ont une URL publique permanente ; les vidéos sont privées et exposées via une route authentifiée qui délivre une URL signée courte.
// Deux entrées : persistAsset() (le fournisseur renvoie une URL temporaire → téléchargement validé) et persistBytes() (le fournisseur renvoie des octets).
// Chaîne : fichier temporaire du fournisseur → validation (HTTPS, hôte autorisé, SSRF, taille, type, octets) → téléchargement serveur
//          → StorageProvider.put() → ligne `stored_assets` (suivi, expiration, suppression de compte) → `storedUrl`.
// Tant qu'aucun StorageProvider n'est configuré, ou que le fournisseur IA ne déclare pas `assetHosts`, RIEN n'est téléchargé : storedUrl reste absent. Les fournisseurs qui renvoient directement des octets passent par persistBytes().
export interface StorageProvider {
  readonly id: string;
  // Reçoit des octets DÉJÀ validés par le serveur et un chemin choisi par le serveur ; ne télécharge jamais d'URL lui-même.
  put(input: { path: string; bytes: Uint8Array; mimeType: string }): Promise<{ storedUrl: string }>;
  remove(path: string): Promise<void>;
}
const registry = new Map<string, () => StorageProvider>([["supabase-storage", () => new SupabaseStorage()]]); // images + vidéos (vidéos en bucket privé)
export function getStorageProvider(): StorageProvider | null {
  const id = process.env.STORAGE_PROVIDER?.trim();
  const factory = id ? registry.get(id) : undefined;
  return factory ? factory() : null;
}
// État sans secret, pour l'administration et pour la disponibilité des fournisseurs qui renvoient des octets (requiresStorage).
export const isStorageConfigured = (): boolean => { const id = process.env.STORAGE_PROVIDER?.trim(); return !!id && registry.has(id); };
export const describeStorage = () => ({ envName: "STORAGE_PROVIDER", configuredId: process.env.STORAGE_PROVIDER?.trim() || null, ready: isStorageConfigured() });

// Octets DÉJÀ validés → StorageProvider.put() → ligne `stored_assets` (suivi, expiration, suppression de compte). Si le suivi échoue, le fichier est retiré (un fichier non suivi ne serait jamais supprimé).
async function storeValidated(storage: StorageProvider, file: { bytes: Uint8Array; mime: string; ext: string }, ctx: { userId: string; generationId: string }): Promise<{ storedUrl: string; path: string }> {
  const path = `${ctx.userId}/${ctx.generationId}/${randomUUID()}.${file.ext}`;
  try {
    const { storedUrl } = await storage.put({ path, bytes: file.bytes, mimeType: file.mime });
    if (!/^https:\/\//.test(storedUrl) && !/^\/api\/media\//.test(storedUrl)) throw new Error("storage:url");
    const expiresAt = RETENTION_DAYS ? new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString() : null;
    const { error } = await createAdminClient().from("stored_assets").insert({ user_id: ctx.userId, generation_id: ctx.generationId, storage_provider: storage.id, path, mime_type: file.mime, bytes: file.bytes.byteLength, expires_at: expiresAt });
    if (error) throw new Error("storage:record");
    return { storedUrl, path };
  } catch (e) {
    await storage.remove(path).catch(() => undefined);
    throw e;
  }
}

type Persistable = { url: string; mimeType: string; storedUrl?: string };
// Conserve le résultat externe tel quel si : pas de stockage, hôtes non déclarés, ou échec de n'importe quelle étape (jamais de faux storedUrl).
export async function persistAsset<A extends Persistable>(asset: A, ctx: { userId: string; generationId: string; hosts: string[]; required?: boolean }): Promise<A> {
  const storage = getStorageProvider();
  if (!storage || ctx.hosts.length === 0) {
    if (ctx.required) throw new Error("storage:not_configured");
    return asset;
  }
  try {
    const file = await downloadValidated(asset.url, asset.mimeType, ctx.hosts);
    const { storedUrl } = await storeValidated(storage, file, ctx);
    return { ...asset, storedUrl };
  } catch (e) {
    if (ctx.required) throw e;
    return asset;
  }
}

// Fournisseur qui renvoie des OCTETS (ex. Hugging Face) : même stockage, même suivi, mais SANS téléchargement ni URL distante (donc aucun risque SSRF).
// Re-contrôle ici, indépendamment du fournisseur : type autorisé, extension cohérente, taille, signature des octets. Lance une exception en cas d'anomalie ;
// l'appelant décide quoi faire (le fournisseur retire les fichiers déjà rangés via discardStored). Jamais de data: URL, jamais de faux storedUrl.
export async function persistBytes(i: { userId: string; generationId: string; bytes: Uint8Array; mime: string; ext: string }): Promise<{ storedUrl: string; path: string }> {
  const storage = getStorageProvider();
  if (!storage) throw new Error("storage:none");
  const kind = kindOf(i.mime);
  if (!kind || ALLOWED_MIME_EXT[i.mime] !== i.ext || i.bytes.byteLength === 0 || i.bytes.byteLength > MAX_BYTES[kind] || !matchesMagic(i.mime, i.bytes)) throw new Error("storage:bad_content");
  return storeValidated(storage, { bytes: i.bytes, mime: i.mime, ext: i.ext }, i);
}
// Retire des fichiers déjà rangés (échec en cours de route). La ligne de suivi n'est supprimée QUE si le fichier a bien été retiré : sinon la tâche de maintenance (purgeable_assets) réessaiera.
export async function discardStored(paths: string[]): Promise<void> {
  const storage = getStorageProvider();
  if (!storage) return;
  for (const p of paths) {
    try { await storage.remove(p); await createAdminClient().from("stored_assets").delete().eq("path", p); } catch { /* conservé pour la maintenance */ }
  }
}

// Suppression de compte : à appeler AVANT auth.admin.deleteUser (la suppression en cascade effacerait la liste des fichiers). Si `failed > 0`, ne pas supprimer le compte.
export async function removeAllForUser(userId: string): Promise<{ removed: number; failed: number }> {
  const db = createAdminClient();
  const { data } = await db.from("stored_assets").select("id,storage_provider,path").eq("user_id", userId);
  return removeRows((data ?? []) as AssetRow[]);
}
// Suppression des fichiers d'UNE génération appartenant à `userId` (utilisé par « Mes créations »). Si `failed > 0`, ne pas supprimer la génération.
export async function removeAssetsForGeneration(userId: string, generationId: string): Promise<{ removed: number; failed: number }> {
  const { data } = await createAdminClient().from("stored_assets").select("id,storage_provider,path").eq("user_id", userId).eq("generation_id", generationId);
  return removeRows((data ?? []) as AssetRow[]);
}
// Tâche de maintenance : fichiers expirés, ou liés à une génération non terminée (échec / expirée) depuis plus d'une heure.
export async function purgeStaleAssets(limit = 200): Promise<{ removed: number; failed: number }> {
  const { data } = await createAdminClient().rpc("purgeable_assets", { p_limit: limit });
  return removeRows((data ?? []) as AssetRow[]);
}
type AssetRow = { id: string; storage_provider: string; path: string };
async function removeRows(rows: AssetRow[]): Promise<{ removed: number; failed: number }> {
  const storage = getStorageProvider();
  let removed = 0, failed = 0;
  for (const r of rows) {
    if (!storage || storage.id !== r.storage_provider) { failed++; continue; } // stockage absent ou différent : on ne supprime pas la ligne, la suppression sera retentée
    try { await storage.remove(r.path); await createAdminClient().from("stored_assets").delete().eq("id", r.id); removed++; } catch { failed++; }
  }
  return { removed, failed };
}
