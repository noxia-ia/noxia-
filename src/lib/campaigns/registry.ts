import "server-only";
import { VerificationRegistry } from "./verification-registry";
import { InternalTestVerifier } from "./internal-test-verifier";
import type { ProviderName } from "./provider-contract";

/**
 * Registre des vérificateurs d'actions sociales.
 *
 * - Aucun adaptateur officiel (YouTube/TikTok/Instagram/Facebook) n'est branché pour l'instant :
 *   ces plateformes échouent FERMÉES (0 crédit) tant qu'un adaptateur réel n'est pas enregistré ici.
 * - Le vérificateur interne est réservé au développement : il n'est JAMAIS enregistré en production,
 *   même si la variable d'environnement est définie.
 */
export function internalVerifierEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NOXIA_INTERNAL_VERIFIER === "1";
}

export function getVerificationRegistry(): VerificationRegistry {
  const registry = new VerificationRegistry();
  if (internalVerifierEnabled()) registry.register("internal", new InternalTestVerifier());
  // TODO (adaptateurs officiels) : registry.register("youtube", new YouTubeOfficialVerifier(...)) quand l'API/OAuth autorisé est en place.
  return registry;
}

// Plateforme de campagne (base) → fournisseur de vérification.
export function providerForPlatform(platform: string): ProviderName {
  return platform === "tiktok" || platform === "youtube" || platform === "instagram" || platform === "facebook" ? platform : "internal";
}

export function verificationAction(requiredAction: string): "follow" | "subscribe" | "visit" | "custom" {
  return requiredAction === "follow" || requiredAction === "subscribe" || requiredAction === "visit" ? requiredAction : "custom";
}
