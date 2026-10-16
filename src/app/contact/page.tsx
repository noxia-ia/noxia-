import Link from "next/link";
import { buildWhatsAppContactUrl, NOXIA_SUPPORT_EMAIL } from "@/lib/support";

export default function ContactPage() {
  const whatsapp = buildWhatsAppContactUrl("Bonjour NOXIA, j'ai besoin d'aide.");
  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10">
      <Link href="/" className="text-sm text-noxia-ash">← NOXIA AI</Link>
      <h1 className="mt-8 font-display text-3xl tracking-widest text-noxia-silver">CONTACT NOXIA</h1>
      <p className="mt-3 text-noxia-ash">Pour un problème, une question, l'achat de crédits ou une demande de campagne publicitaire, contacte l'administrateur.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-md border border-noxia-silver/15 bg-noxia-night p-5 hover:border-noxia-violet/40">
          <h2 className="font-display tracking-widest text-noxia-silver">WhatsApp</h2>
          <p className="mt-2 text-noxia-ash">+228 92 68 86 60</p>
          <p className="mt-3 text-sm text-noxia-ash">Support, achat de crédits, abonnement et demandes publicitaires.</p>
        </a>
        <a href={`mailto:${NOXIA_SUPPORT_EMAIL}`} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-5 hover:border-noxia-violet/40">
          <h2 className="font-display tracking-widest text-noxia-silver">Email</h2>
          <p className="mt-2 break-all text-noxia-ash">{NOXIA_SUPPORT_EMAIL}</p>
          <p className="mt-3 text-sm text-noxia-ash">Pour les demandes de support et les campagnes publicitaires.</p>
        </a>
      </div>
    </main>
  );
}
