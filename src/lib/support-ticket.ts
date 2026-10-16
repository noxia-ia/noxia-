// Validation PURE d'un ticket de support (testable sans serveur). Utilisée par l'action serveur ; la base répète les mêmes bornes.
export const SUPPORT_CATEGORIES = ["complaint", "assistance", "partnership"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = { complaint: "Réclamation urgente", assistance: "Demande d'assistance", partnership: "Entreprise : publicité / partenariat" };
export interface SupportInput { category: SupportCategory; name: string | null; email: string; company: string | null; message: string }

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

export function parseSupportTicket(fd: FormData): { ok: true; value: SupportInput } | { ok: false; message: string } {
  if (clean(fd.get("website"), 200)) return { ok: false, message: "Envoi refusé." }; // champ piège invisible : seuls les robots le remplissent
  const category = clean(fd.get("category"), 20) as SupportCategory;
  if (!SUPPORT_CATEGORIES.includes(category)) return { ok: false, message: "Choisis le type de demande." };
  const email = clean(fd.get("email"), 254).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length < 5) return { ok: false, message: "Adresse e-mail invalide." };
  const message = clean(fd.get("message"), 2000);
  if (message.length < 10) return { ok: false, message: "Ton message est trop court (10 caractères minimum)." };
  const company = clean(fd.get("company"), 120) || null;
  if (category === "partnership" && !company) return { ok: false, message: "Indique le nom de ton entreprise." };
  return { ok: true, value: { category, name: clean(fd.get("name"), 80) || null, email, company: category === "partnership" ? company : null, message } };
}
