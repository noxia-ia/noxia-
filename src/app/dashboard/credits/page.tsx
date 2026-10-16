import Link from "next/link";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { PLANS } from "@/lib/plans";
import { loadPriceBook, resolvePrice, priceLabel } from "@/lib/pricing";
import { buildSubscribeUrl } from "@/lib/whatsapp";
import { getCreditStatus } from "@/lib/credit-status";
import { CreditExpiry } from "@/components/credits/CreditExpiry";
import { buildWhatsAppContactUrl, NOXIA_SUPPORT_EMAIL } from "@/lib/support";
import { NOXIA_GENERATION_COSTS as C } from "@/lib/generation-costs";

// Boutique de crédits : 3 packs (identifiants plus / pro / ultra en base). Prix lus dans plan_prices (FCFA de référence), crédits dans lib/plans.ts.
// Paiement manuel : WhatsApp s'ouvre avec un message prérempli, l'administrateur active le pack. Les crédits sont valables 60 jours.
const PACKS = ["plus", "pro", "ultra"] as const;

export default async function CreditsPage() {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return <main className="mx-auto max-w-3xl p-6"><p className="text-noxia-silver">Accès réservé aux utilisateurs vérifiés.</p></main>;
  const { user, supabase } = gate;
  const { data: profile } = await supabase.from("profiles").select("credits,full_name,display_currency").eq("user_id", user.id).maybeSingle<{ credits: number; full_name: string | null; display_currency: string | null }>();
  const status = await getCreditStatus(supabase, profile?.credits ?? 0);
  const book = await loadPriceBook(supabase);
  const help = buildWhatsAppContactUrl("Bonjour NOXIA, j'ai une question sur mes crédits. Mon compte est : " + user.email);

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10">
      <Link href="/dashboard" className="text-sm text-noxia-ash">← Dashboard</Link>
      <div className="mt-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-noxia-violet">NOXIA CREDITS</p>
          <h1 className="mt-2 font-display text-3xl tracking-widest text-noxia-silver">Acheter des crédits</h1>
          <p className="mt-3 max-w-2xl text-noxia-ash">Solde actuel : <strong className="text-noxia-silver">{status.balance} crédits</strong></p>
          <CreditExpiry status={status} className="mt-1" />
        </div>
        <Link href="/dashboard/parrainage" className="min-h-11 rounded-sm border border-noxia-violet/40 px-4 py-2 text-sm text-noxia-silver">Gagner des crédits en parrainant</Link>
      </div>

      <p className="mt-6 max-w-2xl text-sm text-noxia-ash">Les crédits sont valables <strong className="text-noxia-silver">60 jours</strong> à partir de leur attribution ou de leur achat, puis ils expirent automatiquement. Les crédits qui expirent le plus tôt sont utilisés en premier.</p>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {PACKS.map(id => {
          const p = PLANS[id];
          const price = resolvePrice(book, id, profile?.display_currency);
          const ref = price ? priceLabel({ ...price, display: price.reference, sameCurrency: true }) : undefined;
          const credits = p.credits ?? 0;
          return (
            <article key={id} className={`flex flex-col rounded-md border bg-noxia-night p-5 ${id === "pro" ? "border-noxia-violet/60" : "border-noxia-silver/15"}`}>
              <h2 className="font-display tracking-widest text-noxia-silver">{p.name.replace(/^NOXIA\s+/, "Pack ")}</h2>
              <p className="mt-3 text-3xl text-noxia-silver">{price ? priceLabel(price) : "Prix à définir"}</p>
              <p className="mt-1 text-lg text-noxia-violet">{credits} crédits</p>
              <ul className="mt-4 space-y-1 text-sm text-noxia-ash">
                <li>≈ {Math.floor(credits / C.image.perImage)} images</li>
                <li>≈ {Math.floor(credits / C.video.byDuration[5])} vidéos de 5 s</li>
                <li>≈ {Math.floor(credits / C.music.perGeneration)} musiques</li>
                <li>Valables 60 jours</li>
              </ul>
              <a href={buildSubscribeUrl({ plan: id, name: profile?.full_name, email: user.email, priceText: ref })} target="_blank" rel="noreferrer"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-sm bg-noxia-violet px-4 py-2 text-sm text-white">Acheter via WhatsApp</a>
            </article>
          );
        })}
      </div>
      <p className="mt-4 max-w-2xl text-xs text-noxia-ash">Le paiement n'est pas automatisé : l'administrateur active ton pack après réception du paiement. Le texte et le code ne consomment aucun crédit (ils sont limités par des quotas).</p>

      <section className="mt-8 rounded-md border border-noxia-silver/10 p-5">
        <h2 className="font-display tracking-widest text-noxia-silver">Besoin d’aide ?</h2>
        <p className="mt-2 text-sm text-noxia-ash">WhatsApp : +228 92 68 86 60 · Email : {NOXIA_SUPPORT_EMAIL}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={help} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Écrire sur WhatsApp</a>
          <Link href="/contact" className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Ouvrir le support NOXIA</Link>
        </div>
      </section>
    </main>
  );
}
