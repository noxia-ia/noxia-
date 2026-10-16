import type { Plan } from "@/types/database";
import { PLANS, formatDuration } from "./plans";

// Numéro au format international, sans « + » ni espaces (ex. "2250700000000"). À renseigner ici plus tard.
// Tant qu'il est vide, WhatsApp s'ouvre et laisse choisir le contact.
export const WHATSAPP_NUMBER = "22892688660";

// priceText : prix de RÉFÉRENCE (FCFA) lu en base par l'appelant ; absent → « à définir ». Aucun prix n'est écrit ici.
export function buildSubscribeUrl(a: { plan: Plan; name?: string | null; email?: string | null; priceText?: string | null }) {
  const p = PLANS[a.plan];
  const lines = [
    `Bonjour, je souhaite activer le plan ${p.name} de NOXIA AI.`,
    a.name ? `Nom : ${a.name}` : null,
    a.email ? `Email du compte : ${a.email}` : null,
    `Plan : ${p.name}`, `Prix : ${a.priceText ?? "à définir"}`, `Durée : ${formatDuration(p)}`,
  ].filter(Boolean);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}
