// Bande publicitaire : types et validation (utilisés côté serveur par les actions admin et côté page).
export type AdBannerRow = {
  id: string; label: string; title: string; body: string; image_url: string | null; link_url: string; cta_label: string;
  active: boolean; starts_at: string | null; ends_at: string | null; sort_order: number; hide_for_paid: boolean;
};
export type PublicBanner = Pick<AdBannerRow, "id" | "label" | "title" | "body" | "image_url" | "link_url" | "cta_label">;
export type BannerFormState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

export const BANNER_COLUMNS = "id,label,title,body,image_url,link_url,cta_label,active,starts_at,ends_at,sort_order,hide_for_paid";

const httpsUrl = (v: string): string | null => {
  try { const u = new URL(v); return u.protocol === "https:" && v.length <= 500 ? u.toString() : null; } catch { return null; }
};
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const date = (v: string): string | null | "invalid" => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
};

export function parseBannerForm(fd: FormData): { ok: true; data: Omit<AdBannerRow, "id"> } | { ok: false; error: string } {
  const label = text(fd, "label") || "Sponsorisé";
  const title = text(fd, "title");
  const body = text(fd, "body");
  const cta = text(fd, "cta_label") || "Découvrir";
  const link = httpsUrl(text(fd, "link_url"));
  const imageRaw = text(fd, "image_url");
  const image = imageRaw ? httpsUrl(imageRaw) : null;
  const starts = date(text(fd, "starts_at"));
  const ends = date(text(fd, "ends_at"));
  const order = Number(text(fd, "sort_order") || "0");
  if (!title || title.length > 120) return { ok: false, error: "Le titre est obligatoire (120 caractères maximum)." };
  if (label.length > 30 || cta.length > 30) return { ok: false, error: "Le libellé et le bouton font 30 caractères maximum." };
  if (body.length > 200) return { ok: false, error: "Le texte fait 200 caractères maximum." };
  if (!link) return { ok: false, error: "Le lien doit commencer par https://." };
  if (imageRaw && !image) return { ok: false, error: "L’adresse de l’image doit commencer par https://." };
  if (starts === "invalid" || ends === "invalid") return { ok: false, error: "Date invalide." };
  if (starts && ends && new Date(ends) <= new Date(starts)) return { ok: false, error: "La date de fin doit suivre la date de début." };
  if (!Number.isInteger(order) || order < 0 || order > 1000) return { ok: false, error: "L’ordre doit être un nombre entre 0 et 1000." };
  return { ok: true, data: { label, title, body, image_url: image, link_url: link, cta_label: cta, active: fd.get("active") === "on", starts_at: starts, ends_at: ends, sort_order: order, hide_for_paid: fd.get("hide_for_paid") === "on" } };
}
