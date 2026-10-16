import Link from "next/link";
import { buildWhatsAppContactUrl, NOXIA_SUPPORT_EMAIL } from "@/lib/support";

export function InsufficientCreditsNotice({ message }: { message: string }) {
  const whatsapp = buildWhatsAppContactUrl("Bonjour NOXIA, j'ai besoin d'aide pour acheter des crédits.");
  return (
    <div className="mt-4 rounded-md border border-noxia-violet/30 bg-noxia-night p-4" role="alert">
      <p className="text-sm text-noxia-silver">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/dashboard/credits" className="min-h-11 rounded-sm bg-noxia-violet px-4 py-2 text-sm text-white">Acheter des crédits</Link>
        <Link href="/dashboard/abonnements" className="min-h-11 rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Voir les abonnements</Link>
        <a href={whatsapp} target="_blank" rel="noreferrer" className="min-h-11 rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Acheter / contacter WhatsApp</a>
        <a href={`mailto:${NOXIA_SUPPORT_EMAIL}`} className="min-h-11 rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Support email</a>
      </div>
    </div>
  );
}
