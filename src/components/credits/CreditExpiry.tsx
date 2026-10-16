import { formatExpiryDate, daysUntil, type CreditStatus } from "@/lib/credit-expiry";

// Date d'expiration des crédits : les crédits ont une validité de 60 jours à partir de leur attribution ou de leur achat.
export function CreditExpiry({ status, className = "" }: { status: CreditStatus; className?: string }) {
  if (status.balance <= 0 || !status.nextExpiresAt) return null;
  const d = daysUntil(status.nextExpiresAt);
  const soon = d <= 7;
  return (
    <span className={`block text-xs ${soon ? "text-amber-300" : "text-noxia-ash"} ${className}`}>
      {status.nextExpiringCredits} crédit{status.nextExpiringCredits > 1 ? "s" : ""} expire{status.nextExpiringCredits > 1 ? "nt" : ""} le {formatExpiryDate(status.nextExpiresAt)}{d <= 30 ? ` (dans ${d} jour${d > 1 ? "s" : ""})` : ""}
    </span>
  );
}
