// Détection du type par les OCTETS (jamais par l'extension ni le type annoncé) et nettoyage des noms.
// Module pur, sans dépendance serveur : testable seul.
export type AttachmentKind = "image" | "zip" | "pdf" | "rar";

export function sniffType(b: Uint8Array): { kind: AttachmentKind; mime: string; ext: string } | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { kind: "image", mime: "image/png", ext: "png" };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  }
  if (
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { kind: "image", mime: "image/webp", ext: "webp" };
  }
  // ZIP local file header or empty archive
  if (b.length > 22 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06)) {
    return { kind: "zip", mime: "application/zip", ext: "zip" };
  }
  // PDF : %PDF-
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return { kind: "pdf", mime: "application/pdf", ext: "pdf" };
  }
  // RAR 1.5–4.x : Rar!\x1a\x07\x00  |  RAR 5 : Rar!\x1a\x07\x01
  if (
    b.length > 7 &&
    b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 &&
    b[4] === 0x1a && b[5] === 0x07 && (b[6] === 0x00 || b[6] === 0x01)
  ) {
    return { kind: "rar", mime: "application/vnd.rar", ext: "rar" };
  }
  return null;
}

// Le nom est une donnée NON fiable : on n'en garde que la dernière partie, sans caractères de contrôle ni séparateurs.
export function sanitizeName(raw: string): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean || "fichier";
}
