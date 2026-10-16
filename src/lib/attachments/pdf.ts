// Extraction de texte PDF côté serveur, pure JS, sans dépendance externe.
// Objectif : fournir un digest lisible à l'IA (pas un OCR, pas un rendu fidèle).
// Limites strictes anti-DoS : taille, pages, caractères.

export interface PdfLimits {
  maxBytes: number;
  maxPages: number;
  maxChars: number;
  maxObjectsScanned: number;
}

export const DEFAULT_PDF_LIMITS: PdfLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxPages: 40,
  maxChars: 80_000,
  maxObjectsScanned: 8_000,
};

export type PdfAnalyzeResult =
  | { ok: true; digest: string; stats: PdfStats }
  | { ok: false; message: string; code?: string };

export interface PdfStats {
  pagesHint: number;
  chars: number;
  truncated: boolean;
  encrypted: boolean;
  objectsScanned: number;
}

function reject(code: string, message: string): PdfAnalyzeResult {
  return { ok: false, message, code };
}

/** Décodage minimal des chaînes PDF (littérales et hex). */
function decodePdfString(raw: string): string {
  // Hex string <...>
  if (raw.startsWith("<") && raw.endsWith(">")) {
    const hex = raw.slice(1, -1).replace(/\s/g, "");
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2) return "";
    const out: number[] = [];
    for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
    return new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(out));
  }
  // Literal ( ... ) with basic escapes
  if (raw.startsWith("(") && raw.endsWith(")")) {
    let s = raw.slice(1, -1);
    s = s
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\b/g, "\b")
      .replace(/\\f/g, "\f")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\")
      .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    return s;
  }
  return raw;
}

/**
 * Analyse un PDF : extrait le texte des opérateurs Tj / TJ / ' / " dans les flux.
 * Ignore les images, fonts embarqués, XObject complexes. Refuse les PDF chiffrés.
 */
export function analyzePdf(input: Uint8Array, limits: PdfLimits = DEFAULT_PDF_LIMITS): PdfAnalyzeResult {
  if (input.byteLength === 0) return reject("EMPTY", "Le PDF est vide.");
  if (input.byteLength > limits.maxBytes) {
    return reject("TOO_LARGE", `PDF trop volumineux (${Math.round(limits.maxBytes / 1024 / 1024)} Mo maximum).`);
  }
  // Magic
  if (!(input[0] === 0x25 && input[1] === 0x50 && input[2] === 0x44 && input[3] === 0x46 && input[4] === 0x2d)) {
    return reject("NOT_PDF", "Fichier PDF invalide.");
  }

  const text = new TextDecoder("latin1").decode(input); // bytes → string indexable

  // Chiffrement
  if (/\/Encrypt\b/.test(text)) {
    return reject("ENCRYPTED", "Ce PDF est protégé par un mot de passe. Impossible de l'analyser.");
  }

  const stats: PdfStats = {
    pagesHint: 0,
    chars: 0,
    truncated: false,
    encrypted: false,
    objectsScanned: 0,
  };

  // Estimation pages via /Type /Page (approximatif)
  const pageMatches = text.match(/\/Type\s*\/Page\b/g);
  stats.pagesHint = pageMatches ? Math.min(pageMatches.length, limits.maxPages) : 0;
  if (pageMatches && pageMatches.length > limits.maxPages) {
    stats.truncated = true;
  }

  // Collecte des chaînes dans les content streams via opérateurs texte courants
  const pieces: string[] = [];
  let used = 0;

  // 1) Opérateurs Tj, ', " : (string) Tj
  const tjRe = /\((?:\\.|[^\\)])*\)\s*(?:Tj|'|")/g;
  // 2) Tableaux TJ : [ (s) n (s) ... ] TJ
  const tjArrayRe = /\[((?:[^\[\]]|\[[^\]]*\])*)\]\s*TJ/g;
  // 3) Chaînes hex dans le même contexte
  const hexTjRe = /<([0-9a-fA-F\s]+)>\s*(?:Tj|'|")/g;

  const push = (s: string) => {
    if (!s || used >= limits.maxChars) {
      if (used >= limits.maxChars) stats.truncated = true;
      return;
    }
    const cleaned = s.replace(/\0/g, "").trim();
    if (!cleaned) return;
    const chunk = cleaned.length + 1 > limits.maxChars - used
      ? cleaned.slice(0, limits.maxChars - used)
      : cleaned;
    pieces.push(chunk);
    used += chunk.length + 1;
    if (used >= limits.maxChars) stats.truncated = true;
  };

  let m: RegExpExecArray | null;
  let scanned = 0;

  while ((m = tjRe.exec(text)) !== null && scanned < limits.maxObjectsScanned) {
    scanned++;
    const raw = m[0].replace(/\s*(?:Tj|'|")\s*$/, "");
    push(decodePdfString(raw));
  }
  while ((m = hexTjRe.exec(text)) !== null && scanned < limits.maxObjectsScanned) {
    scanned++;
    push(decodePdfString(`<${m[1]}>`));
  }
  while ((m = tjArrayRe.exec(text)) !== null && scanned < limits.maxObjectsScanned) {
    scanned++;
    const inner = m[1];
    const parts = inner.match(/\((?:\\.|[^\\)])*\)|<([0-9a-fA-F\s]+)>/g) || [];
    for (const p of parts) push(decodePdfString(p.startsWith("<") ? p : p));
  }

  stats.objectsScanned = scanned;
  stats.chars = used;

  if (pieces.length === 0) {
    // Fallback : chercher des blocs de texte ASCII imprimable longs (PDF mal formés / compressés Flate non décodés)
    const printable = text.match(/[\x20-\x7E\u00A0-\u00FF]{40,}/g) || [];
    for (const block of printable) {
      if (used >= limits.maxChars) break;
      // Filtrer le bruit structurel PDF
      if (/^\/[A-Za-z]/.test(block) || /endstream|endobj|xref|trailer/.test(block)) continue;
      push(block.slice(0, 500));
    }
  }

  if (pieces.length === 0) {
    return {
      ok: true,
      digest: [
        `Document PDF : ${input.byteLength} octets ; pages estimées ≈ ${stats.pagesHint || "?"}.`,
        "Aucun texte extractible (PDF scanné, compressé Flate non décompressé, ou purement graphique).",
        "L'IA ne peut analyser que le nom du fichier et ces métadonnées.",
      ].join("\n"),
      stats: { ...stats, truncated: true },
    };
  }

  const body = pieces.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const header = [
    `Document PDF : ${input.byteLength} octets ; pages estimées ≈ ${stats.pagesHint || "?"} ; ${stats.chars} caractère(s) extraits${stats.truncated ? " (tronqué)" : ""}.`,
    "Contenu textuel (extraction heuristique, pas OCR) :",
  ].join("\n");

  return { ok: true, digest: `${header}\n\n${body}`, stats };
}
