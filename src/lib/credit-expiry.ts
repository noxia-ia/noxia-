// Fichier PUR (aucun import) : formatage des dates d'expiration des crédits (validité 60 jours). Testable sans serveur.
export interface CreditStatus { balance: number; nextExpiresAt: string | null; nextExpiringCredits: number; expiredNow: number }

/** « 12 déc. 2026 » (fuseau UTC pour un affichage identique serveur/navigateur). */
export function formatExpiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}
