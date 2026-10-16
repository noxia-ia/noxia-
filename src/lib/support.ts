export const NOXIA_SUPPORT_WHATSAPP_NUMBER = "22892688660";
export const NOXIA_SUPPORT_EMAIL = "support.noxia@gmail.com";

export function buildWhatsAppContactUrl(message?: string) {
  const base = `https://wa.me/${NOXIA_SUPPORT_WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function buildSupportMailto(subject = "Support NOXIA AI") {
  return `mailto:${NOXIA_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
