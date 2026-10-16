// Détection et résumé RAR. Pas de décompression native (format propriétaire, pas de dépendance unrar).
// L'IA reçoit un digest informatif ; le contenu binaire n'est jamais extrait.

export interface RarLimits {
  maxBytes: number;
}

export const DEFAULT_RAR_LIMITS: RarLimits = {
  maxBytes: 5 * 1024 * 1024,
};

export type RarAnalyzeResult =
  | { ok: true; digest: string; stats: { version: "1.5-4" | "5"; size: number } }
  | { ok: false; message: string; code?: string };

export function analyzeRar(input: Uint8Array, limits: RarLimits = DEFAULT_RAR_LIMITS): RarAnalyzeResult {
  if (input.byteLength === 0) return { ok: false, message: "L'archive RAR est vide.", code: "EMPTY" };
  if (input.byteLength > limits.maxBytes) {
    return {
      ok: false,
      message: `Archive RAR trop volumineuse (${Math.round(limits.maxBytes / 1024 / 1024)} Mo maximum).`,
      code: "TOO_LARGE",
    };
  }
  if (
    !(
      input.length > 7 &&
      input[0] === 0x52 && input[1] === 0x61 && input[2] === 0x72 && input[3] === 0x21 &&
      input[4] === 0x1a && input[5] === 0x07 && (input[6] === 0x00 || input[6] === 0x01)
    )
  ) {
    return { ok: false, message: "Fichier RAR invalide.", code: "NOT_RAR" };
  }

  const version = input[6] === 0x01 ? "5" : "1.5-4";
  const digest = [
    `Archive RAR (version ${version}) : ${input.byteLength} octets.`,
    "Le contenu des archives RAR n'est pas extrait côté serveur (format propriétaire).",
    "Pour une analyse détaillée des fichiers, convertis l'archive en ZIP et renvoie-la.",
    "L'IA peut uniquement tenir compte du nom et de la taille de cette archive.",
  ].join("\n");

  return { ok: true, digest, stats: { version, size: input.byteLength } };
}
