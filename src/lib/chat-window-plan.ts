// Correspondance plan d'abonnement → palier de fenêtre de chat. Fichier PUR (aucun import) pour rester testable.
// Les 4 paliers ont leur propre fenêtre (table chat_window_rules). Les anciennes formules à durée (daily…annual) n'ont pas de palier propre :
// la fenêtre suit leur DURÉE d'abonnement (1 j / 7 j → Plus, 30 j → Pro, 365 j → Ultra). Décision produit, modifiable ici en un seul endroit.
export type WindowPlan = "free" | "plus" | "pro" | "ultra";

const TIERS: Record<string, WindowPlan> = { free: "free", plus: "plus", pro: "pro", ultra: "ultra" };
export const LEGACY_WINDOW_TIER: Record<string, WindowPlan> = { daily: "plus", weekly: "plus", monthly: "pro", annual: "ultra" };
const PAID_FALLBACK: WindowPlan = "plus"; // formule payante inconnue : jamais la fenêtre Free

export function windowTierForPlan(plan: unknown): WindowPlan {
  if (typeof plan !== "string" || !Object.hasOwn(TIERS, plan) && !Object.hasOwn(LEGACY_WINDOW_TIER, plan)) return plan === "free" || plan == null ? "free" : PAID_FALLBACK;
  return Object.hasOwn(TIERS, plan) ? TIERS[plan] : LEGACY_WINDOW_TIER[plan];
}

// Délai de grâce : après l'échéance d'un abonnement payant, le palier (donc la fenêtre) est conservé 24 h pour laisser le temps de renouveler ; ensuite → Free.
// Ne s'applique qu'à une échéance NATURELLE (statut « active » dont la date est dépassée). Suspension, annulation ou expiration forcée par l'admin : pas de grâce.
// Ne concerne QUE la durée de la fenêtre de chat : l'accès, les crédits et l'affichage « expiré » ne sont pas modifiés.
export const GRACE_MS = 24 * 60 * 60 * 1000;

export function resolveWindowTier(sub: { status: string; plan: string; expires_at: string | null } | null, now: number = Date.now()): WindowPlan {
  if (!sub || sub.plan === "free" || sub.status !== "active") return "free";
  const end = sub.expires_at ? new Date(sub.expires_at).getTime() : NaN;
  if (sub.expires_at && Number.isNaN(end)) return "free"; // date illisible : on ne devine pas
  if (!sub.expires_at || end >= now || now - end <= GRACE_MS) return windowTierForPlan(sub.plan);
  return "free";
}
