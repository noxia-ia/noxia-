// Règles du stockage permanent (serveur). Rien n'est téléchargé tant qu'un stockage ET un fournisseur déclarant ses `assetHosts` ne sont pas configurés.
export const ALLOWED_MIME_EXT: Readonly<Record<string, string>> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", // pas de SVG : il peut contenir du script
  "video/mp4": "mp4", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a",
};
const MB = 1024 * 1024;
export const MAX_BYTES: Readonly<Record<"image" | "audio" | "video", number>> = { image: 15 * MB, audio: 50 * MB, video: 100 * MB }; // la vidéo est tamponnée en mémoire : à revoir si la limite monte
export const DOWNLOAD_TIMEOUT_MS = 60_000;
export const RETENTION_DAYS: number | null = null; // null = conservation illimitée ; sinon `expires_at` est renseignée et purgée par la tâche de maintenance

export const kindOf = (mime: string): "image" | "audio" | "video" | null => { const k = mime.split("/")[0]; return k === "image" || k === "audio" || k === "video" ? k : null; };

// Contrôle des premiers octets : le type annoncé par le serveur distant n'est jamais cru sur parole.
export function matchesMagic(mime: string, b: Uint8Array): boolean {
  const at = (i: number, s: string) => s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  switch (mime) {
    case "image/png": return b[0] === 0x89 && at(1, "PNG");
    case "image/jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/webp": return at(0, "RIFF") && at(8, "WEBP");
    case "video/mp4": case "audio/mp4": return at(4, "ftyp");
    case "video/webm": return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "audio/mpeg": return at(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case "audio/wav": return at(0, "RIFF") && at(8, "WAVE");
    case "audio/ogg": return at(0, "OggS");
    default: return false;
  }
}

// Supabase Storage : les trois buckets sont privés en lecture. Aucune écriture depuis le navigateur.
export const IMAGE_BUCKET = "dracula-images";
export const VIDEO_BUCKET = "dracula-videos";
export const AUDIO_BUCKET = "dracula-audio";
// Forme EXACTE des chemins fabriqués par le serveur : <userId>/<generationId>/<uuid>.<ext> (trois UUID). Tout autre chemin est refusé (pas de « .. », pas de sous-dossier libre).
export const STORED_VIDEO_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm)$/;
export const STORED_AUDIO_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|wav|ogg|m4a)$/;
export const STORED_IMAGE_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
