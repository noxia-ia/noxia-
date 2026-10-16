import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { MODERATION_BLOCKED_MESSAGE } from "@/lib/safety/policy";

export const ERROR_CODES = ["PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_RATE_LIMIT", "PROVIDER_MISCONFIGURED", "INVALID_REQUEST", "CONTENT_BLOCKED",
  "INSUFFICIENT_CREDITS", "AUTH_REQUIRED", "AGE_RESTRICTED", "ACCOUNT_SUSPENDED", "GENERATION_FAILED", "RESULT_INVALID", "NO_PROVIDER", "USER_RATE_LIMITED"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// Messages compréhensibles pour l'utilisateur. Aucun détail technique, aucune clé, aucune stack trace.
export const USER_MESSAGES: Record<ErrorCode, string> = {
  PROVIDER_UNAVAILABLE: "Le service est temporairement indisponible.",
  PROVIDER_TIMEOUT: "Le service IA a mis trop de temps à répondre. Réessaie.",
  PROVIDER_RATE_LIMIT: "Le service IA est très sollicité. Réessaie dans un moment.",
  PROVIDER_MISCONFIGURED: "Le service est temporairement indisponible.",
  INVALID_REQUEST: "Ta demande ne peut pas être traitée.",
  CONTENT_BLOCKED: MODERATION_BLOCKED_MESSAGE,
  INSUFFICIENT_CREDITS: "Crédits insuffisants.",
  AUTH_REQUIRED: "Connecte-toi pour continuer.",
  AGE_RESTRICTED: AGE_DENIED_MESSAGE,
  ACCOUNT_SUSPENDED: "Ton compte est suspendu. Contacte l'administrateur.",
  GENERATION_FAILED: "Ta génération a échoué.",
  RESULT_INVALID: "Ta génération a échoué.",
  NO_PROVIDER: "Aucun fournisseur IA n'est actuellement disponible.",
  USER_RATE_LIMITED: "Trop de demandes. Patiente un instant avant de réessayer.",
};

// Politique : réessayer le MÊME fournisseur (erreurs temporaires uniquement) / passer au fournisseur suivant.
// Jamais de réessai ni de bascule pour : contenu refusé, requête invalide, crédits, âge, sécurité.
export const RETRY_POLICY: Record<ErrorCode, { retrySame: boolean; fallback: boolean }> = {
  PROVIDER_UNAVAILABLE: { retrySame: true, fallback: true }, PROVIDER_TIMEOUT: { retrySame: true, fallback: true }, PROVIDER_RATE_LIMIT: { retrySame: true, fallback: true },
  PROVIDER_MISCONFIGURED: { retrySame: false, fallback: true }, RESULT_INVALID: { retrySame: false, fallback: true },
  GENERATION_FAILED: { retrySame: false, fallback: false }, INVALID_REQUEST: { retrySame: false, fallback: false }, CONTENT_BLOCKED: { retrySame: false, fallback: false },
  INSUFFICIENT_CREDITS: { retrySame: false, fallback: false }, AUTH_REQUIRED: { retrySame: false, fallback: false }, AGE_RESTRICTED: { retrySame: false, fallback: false },
  ACCOUNT_SUSPENDED: { retrySame: false, fallback: false }, NO_PROVIDER: { retrySame: false, fallback: false }, USER_RATE_LIMITED: { retrySame: false, fallback: false },
};
export const isTransient = (c: ErrorCode) => RETRY_POLICY[c].retrySame;

// Les fournisseurs LANCENT cette erreur ; `internal` reste côté serveur (jamais affiché ni stocké).
export class ProviderError extends Error {
  constructor(public readonly code: ErrorCode, public readonly internal = "", public readonly httpStatus?: number) { super(code); this.name = "ProviderError"; }
}
export interface NormalizedError { code: ErrorCode; message: string }
export const normalize = (e: ProviderError): NormalizedError => ({ code: e.code, message: USER_MESSAGES[e.code] });

// Aide pour les futurs fournisseurs : réponse HTTP → erreur normalisée.
export function fromHttpStatus(status: number): ProviderError {
  const code: ErrorCode = status === 429 ? "PROVIDER_RATE_LIMIT" : status === 408 || status === 504 ? "PROVIDER_TIMEOUT" : status === 401 || status === 402 || status === 403 ? "PROVIDER_MISCONFIGURED"
    : status === 451 ? "CONTENT_BLOCKED" : status === 400 || status === 404 || status === 422 ? "INVALID_REQUEST" : status >= 500 ? "PROVIDER_UNAVAILABLE" : "GENERATION_FAILED";
  return new ProviderError(code, `http_${status}`, status);
}
export function classifyError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const name = (e as { name?: string } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") return new ProviderError("PROVIDER_TIMEOUT", "abort");
  if (e instanceof TypeError) return new ProviderError("PROVIDER_UNAVAILABLE", "network");
  return new ProviderError("GENERATION_FAILED", "unknown");
}
