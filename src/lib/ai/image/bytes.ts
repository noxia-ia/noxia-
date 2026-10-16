import { ProviderError } from "@/lib/providers/errors";
import { MAX_BYTES } from "@/lib/storage/policy";

// Validation des OCTETS d'une image renvoyée par un fournisseur (module pur : aucun accès réseau, base ou fichier).
// Principe : le type est déduit des premiers octets, jamais de l'en-tête Content-Type. Seuls PNG, JPEG et WebP passent.
// SVG, HTML, JSON, GIF… n'ont pas de signature acceptée : ils sont rejetés par construction.
// Chaque rejet lance RESULT_INVALID (aucun réessai chez le même fournisseur, aucun crédit débité) ; la raison reste interne.
export const MAX_DIMENSION = 8192;        // largeur ou hauteur maximale acceptée (pixels)
export const MAX_PIXELS = 40_000_000;     // garde-fou « bombe de décompression » : l'image n'est jamais décodée ici, mais le navigateur l'affichera
export const MAX_IMAGE_BYTES = MAX_BYTES.image;

export interface InspectedImage { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp"; width: number; height: number }

const bad = (why: string) => new ProviderError("RESULT_INVALID", `img_${why}`);
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, s: string) => s.length > 0 && i + s.length <= b.length && s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));

function png(b: Uint8Array): { width: number; height: number } {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || !SIG.every((v, i) => b[i] === v) || u32be(b, 8) !== 13 || !ascii(b, 12, "IHDR")) throw bad("png_header");
  const tail = b.length - 12; // un PNG complet se termine par le bloc IEND (longueur 0 + « IEND » + CRC)
  if (u32be(b, tail) !== 0 || !ascii(b, tail + 4, "IEND")) throw bad("truncated");
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpeg(b: Uint8Array): { width: number; height: number } {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) throw bad("jpeg_header");
  let eoi = false; // marqueur de fin FFD9 attendu dans les derniers octets (certains encodeurs ajoutent un peu de remplissage)
  for (let i = b.length - 2; i >= Math.max(2, b.length - 64); i--) if (b[i] === 0xff && b[i + 1] === 0xd9) { eoi = true; break; }
  if (!eoi) throw bad("truncated");
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) throw bad("jpeg_marker");
    while (b[i + 1] === 0xff) i++; // octets de remplissage
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // marqueurs sans longueur
    if (m === 0xd9 || m === 0xda) throw bad("jpeg_no_size"); // fin ou début des données avant toute taille
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) throw bad("truncated");
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { // SOF0–SOF15 (hors DHT, JPG, DAC)
      if (len < 8) throw bad("jpeg_sof");
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + len;
  }
  throw bad("jpeg_no_size");
}

function webp(b: Uint8Array): { width: number; height: number } {
  if (b.length < 30 || !ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) throw bad("webp_header");
  const total = u32le(b, 4) + 8; // taille déclarée par le conteneur : elle doit correspondre aux octets reçus (à 1 octet de remplissage près)
  if (total > b.length || total < b.length - 1) throw bad("truncated");
  if (ascii(b, 12, "VP8 ")) {
    if (!(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) throw bad("webp_vp8");
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (ascii(b, 12, "VP8L")) {
    if (b[20] !== 0x2f) throw bad("webp_vp8l");
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (ascii(b, 12, "VP8X")) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  throw bad("webp_chunk");
}

export function inspectImageBytes(bytes: Uint8Array, maxBytes: number = MAX_IMAGE_BYTES): InspectedImage {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw bad("empty");
  if (bytes.byteLength > maxBytes) throw bad("too_large");
  let mime: InspectedImage["mime"], ext: InspectedImage["ext"], dims: { width: number; height: number };
  if (bytes[0] === 0x89) { mime = "image/png"; ext = "png"; dims = png(bytes); }
  else if (bytes[0] === 0xff) { mime = "image/jpeg"; ext = "jpg"; dims = jpeg(bytes); }
  else if (bytes[0] === 0x52) { mime = "image/webp"; ext = "webp"; dims = webp(bytes); }
  else throw bad("type"); // SVG (« < »), HTML, JSON, GIF, binaire inconnu…
  const { width, height } = dims;
  if (!(width >= 1 && height >= 1) || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw bad("dimensions");
  return { mime, ext, width, height };
}

// L'en-tête Content-Type annoncé par le serveur distant ne doit jamais CONTREDIRE les octets : « image/png » sur du JPEG, « text/html », « image/svg+xml »,
// « application/json »… → rejet. Un type neutre (octet-stream) n'affirme rien : accepté seulement parce que les octets, eux, ont été vérifiés.
export function assertDeclaredMime(contentType: string | null | undefined, detected: InspectedImage["mime"]): void {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (t === "application/octet-stream" || t === "binary/octet-stream") return;
  if ((t === "image/jpg" ? "image/jpeg" : t) !== detected) throw bad("mime_mismatch");
}
