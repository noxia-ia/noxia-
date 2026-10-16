/**
 * NOXIA Phase 1 — single source of truth for NOXIA credit economics.
 *
 * These are NOXIA credits, not provider credits. Provider billing/costs are
 * intentionally kept separate from this table.
 */
export const NOXIA_GENERATION_COSTS = {
  // Texte et code : 0 crédit. Ils sont limités par des QUOTAS à fenêtre glissante (chat_window_rules : max_messages, max_code), pas par des crédits.
  code: { simple: 0 },
  image: { perImage: 4 },
  // Vidéo : prix par palier de durée (pas de proportionnalité). Les durées proposées sont 5, 10, 15 et 30 secondes.
  video: { byDuration: { 5: 15, 10: 25, 15: 32, 30: 50 } as Readonly<Record<number, number>> },
  music: { perGeneration: 8 },
  asmr: { audio: 5, image: 1 }, // ASMR vidéo : même barème que la vidéo (videoCreditCost)
  agents: { perMessage: 0 },
  voice: { sttPer30Seconds: 1, perGeneration: 5 }, // voix (synthèse) : 5 crédits par génération
  // Pièces jointes du chat (décision du propriétaire : 2 crédits). Un message qui porte une image ou un ZIP coûte ce montant À LA PLACE du prix d'un message texte (jamais les deux).
  attachments: { imageAnalysis: 2, zipAnalysis: 2, imageEdit: 2 },
} as const;

export function imageCreditCost(count: number): number {
  if (!Number.isInteger(count) || count < 1) throw new Error("invalid_image_count");
  return NOXIA_GENERATION_COSTS.image.perImage * count;
}

export function videoCreditCost(durationSeconds: number): number {
  const cost = Number.isInteger(durationSeconds) ? NOXIA_GENERATION_COSTS.video.byDuration[durationSeconds] : undefined;
  if (cost === undefined) throw new Error("invalid_video_duration");
  return cost;
}

export function musicCreditCost(durationSeconds: number): number {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1) throw new Error("invalid_music_duration");
  return NOXIA_GENERATION_COSTS.music.perGeneration; // 8 crédits par musique, quelle que soit la durée proposée
}

export function asmrVideoCreditCost(durationSeconds: number): number {
  return videoCreditCost(durationSeconds);
}

export function asmrCreditCost(kind: "video" | "audio" | "image", durationSeconds?: number): number {
  if (kind === "video") return asmrVideoCreditCost(durationSeconds ?? 0);
  return NOXIA_GENERATION_COSTS.asmr[kind];
}

export function ttsCreditCost(text: string): number {
  if (!text.trim().length) throw new Error("empty_tts_text");
  return NOXIA_GENERATION_COSTS.voice.perGeneration; // 5 crédits par génération de voix
}

/** Used when the STT pipeline has an authoritative duration. */
export function sttCreditCost(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("invalid_stt_duration");
  return Math.max(1, Math.ceil(durationSeconds / 30) * NOXIA_GENERATION_COSTS.voice.sttPer30Seconds);
}

export type AttachmentKind = "image" | "zip" | "pdf" | "rar"; // pdf/rar : même tarif que ZIP (analyse de fichier)
/** Coût d'un message de chat selon ses pièces jointes (calculé côté serveur à partir des pièces VALIDÉES en base, jamais depuis le navigateur). */
export function chatMessageCreditCost(kinds: readonly AttachmentKind[]): number {
  if (kinds.length === 0) return NOXIA_GENERATION_COSTS.agents.perMessage;
  const c = NOXIA_GENERATION_COSTS.attachments;
  return Math.max(...kinds.map(k => (k === "image" ? c.imageAnalysis : c.zipAnalysis)));
}

/** Garde serveur : seuls les prix du barème (message texte, image, ZIP) peuvent être réservés/débités pour un message de chat. */
export function isValidChatMessageCost(credits: number): boolean {
  const c = NOXIA_GENERATION_COSTS;
  return credits === c.agents.perMessage || credits === c.attachments.imageAnalysis || credits === c.attachments.zipAnalysis; // 0 (texte), 2 (pièce jointe)
}

export const CODE_CREDIT_COST = NOXIA_GENERATION_COSTS.code.simple;
export const AGENT_MESSAGE_CREDIT_COST = NOXIA_GENERATION_COSTS.agents.perMessage;

export type GenerationCostModule = "code" | "image" | "video" | "asmr" | "music" | "agents";

/**
 * Server-side admission cost derived from the same source of truth used by the
 * module actions. The browser can display an estimate, but it cannot choose the
 * amount reserved in the database.
 */
export function generationCreditCost(module: GenerationCostModule, params?: unknown): number {
  const p = params && typeof params === "object" ? params as Record<string, unknown> : {};
  switch (module) {
    case "code": return CODE_CREDIT_COST;
    case "agents": return AGENT_MESSAGE_CREDIT_COST;
    case "image": return imageCreditCost(Number(p.count));
    case "video": return videoCreditCost(Number(p.durationSeconds));
    case "music": return musicCreditCost(Number(p.durationSeconds));
    case "asmr": return asmrCreditCost(String(p.type) as "video" | "audio" | "image", Number(p.durationSeconds));
  }
}
