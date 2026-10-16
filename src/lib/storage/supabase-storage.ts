import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_BUCKET, VIDEO_BUCKET, AUDIO_BUCKET, STORED_IMAGE_PATH_RE, STORED_VIDEO_PATH_RE, STORED_AUDIO_PATH_RE, ALLOWED_MIME_EXT, MAX_BYTES } from "./policy";
import type { StorageProvider } from "./index";

// StorageProvider Supabase Storage — images, vidéos et audios. Activé par STORAGE_PROVIDER=supabase-storage.
// Écriture : clé SERVEUR seulement (createAdminClient) ; le navigateur n'a aucune politique d'écriture sur ces buckets (migrations 0012+).
// Garde-fous répétés ici (défense en profondeur) : chemin exact, type d'image autorisé, taille maximale. Les octets ont DÉJÀ été validés par l'appelant.
// Lecture : images, vidéos et audios restent privés. Le navigateur passe par une route authentifiée qui vérifie le propriétaire puis délivre une URL signée courte.
export class SupabaseStorage implements StorageProvider {
  readonly id = "supabase-storage";

  async put(input: { path: string; bytes: Uint8Array; mimeType: string }): Promise<{ storedUrl: string }> {
    const ext = ALLOWED_MIME_EXT[input.mimeType];
    const isImage = input.mimeType.startsWith("image/");
    const isVideo = input.mimeType.startsWith("video/");
    const isAudio = input.mimeType.startsWith("audio/");
    const bucket = isImage ? IMAGE_BUCKET : isVideo ? VIDEO_BUCKET : isAudio ? AUDIO_BUCKET : null;
    const pathOk = isImage ? STORED_IMAGE_PATH_RE.test(input.path) : isVideo ? STORED_VIDEO_PATH_RE.test(input.path) : isAudio ? STORED_AUDIO_PATH_RE.test(input.path) : false;
    const kind = isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : null;
    if (!bucket || !pathOk || !ext || !kind || !input.path.endsWith(`.${ext}`)) throw new Error("storage:path_or_mime");
    if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_BYTES[kind]) throw new Error("storage:size");

    const db = createAdminClient();
    const { error } = await db.storage.from(bucket).upload(input.path, input.bytes, { contentType: input.mimeType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error("storage:upload");

    // Tous les médias restent PRIVÉS. Le navigateur passe par une route authentifiée qui
    // vérifie le propriétaire avant de délivrer une URL signée courte.
    const mediaKind = isImage ? "image" : isVideo ? "video" : "audio";
    return { storedUrl: `/api/media/${mediaKind}?path=${encodeURIComponent(input.path)}` };
  }

  async remove(path: string): Promise<void> {
    const isImage = STORED_IMAGE_PATH_RE.test(path);
    const isVideo = STORED_VIDEO_PATH_RE.test(path);
    const isAudio = STORED_AUDIO_PATH_RE.test(path);
    const bucket = isImage ? IMAGE_BUCKET : isVideo ? VIDEO_BUCKET : isAudio ? AUDIO_BUCKET : null;
    if (!bucket) throw new Error("storage:path");
    const { error } = await createAdminClient().storage.from(bucket).remove([path]);
    if (error) throw new Error("storage:remove");
  }
}
