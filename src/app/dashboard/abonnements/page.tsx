import { getSessionProfile } from "@/lib/auth";
import { getCurrentSubscription, effectiveStatus } from "@/lib/subscription";
import { OFFER_PLANS, PLANS, isLegacyPlan } from "@/lib/plans";
import { loadPriceBook, resolvePrice, priceLabel } from "@/lib/pricing";
import { buildSubscribeUrl } from "@/lib/whatsapp";
import { PlanCard } from "@/components/subscription/PlanCard";

export default async function AbonnementsPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const sub = await getCurrentSubscription(supabase, user.id);
  const current = effectiveStatus(sub) === "active" ? (sub?.plan ?? "free") : null;
  const name = profile?.full_name || (user.user_metadata?.full_name as string | undefined);
  const book = await loadPriceBook(supabase); // prix lus en base (plan_prices), jamais écrits dans les composants
  return (
    <main className="p-5 md:p-10">
      <h1 className="font-display text-3xl text-noxia-silver">Abonnements</h1>
      <p className="mt-2 max-w-xl text-noxia-ash">Clique sur « S'abonner » : WhatsApp s'ouvre avec un message prérempli. Le paiement n'est pas automatisé : ton plan est activé manuellement par l'administrateur.</p><p className="mt-3 max-w-xl text-xs text-noxia-ash">Pour acheter des crédits ou signaler un problème, contacte l'administrateur sur WhatsApp au +228 92 68 86 60 ou par email à support.noxia@gmail.com.</p>
      {current && isLegacyPlan(current) && <p className="mt-4 max-w-xl rounded-sm border border-noxia-silver/20 p-3 text-sm text-noxia-ash">Ton plan actuel, {PLANS[current].name}, est une ancienne formule : il reste actif jusqu'à son expiration.</p>}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {OFFER_PLANS.map(p => {
          const price = resolvePrice(book, p.id, profile?.display_currency);
          const ref = price ? priceLabel({ ...price, display: price.reference, sameCurrency: true }) : undefined; // le message WhatsApp porte le tarif de référence (FCFA)
          return <PlanCard key={p.id} plan={p} price={price} isCurrent={current === p.id}
            cta={p.kind === "free" ? null : price ? { href: buildSubscribeUrl({ plan: p.id, name, email: user.email, priceText: ref }), label: current === p.id ? "Renouveler" : "S'abonner", external: true } : null} />;
        })}
      </div>
      <p className="mt-6 max-w-xl text-xs text-noxia-ash">La devise d'affichage se règle dans Paramètres. Le montant de référence est en FCFA ; un prix dans une autre devise n'apparaît que s'il a été validé.</p>
    </main>
  );
}
