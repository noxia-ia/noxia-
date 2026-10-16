import { type PlanConfig, formatDuration, formatCredits } from "@/lib/plans";
import { type ResolvedPrice, priceLabel, referenceNote } from "@/lib/pricing";

export interface PlanCta { href: string; label: string; external?: boolean }
export function PlanCard({ plan, price, isCurrent, cta }: { plan: PlanConfig; price: ResolvedPrice | null; isCurrent: boolean; cta: PlanCta | null }) {
  const note = referenceNote(price);
  return (
    <article className={`flex min-w-0 flex-col rounded-md border bg-noxia-night p-6 ${isCurrent ? "border-noxia-violet/70 shadow-glow" : "border-noxia-silver/15"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xl tracking-widest text-noxia-silver">{plan.name}</h3>
        {isCurrent && <span className="text-xs text-noxia-violet">Plan actuel</span>}
      </div>
      <p className="mt-4 font-display text-2xl text-noxia-silver">{priceLabel(price)}</p>
      {note && <p className="mt-1 text-xs text-noxia-ash">{note}</p>}
      <p className="mt-1 text-sm text-noxia-ash">{plan.description}</p>{plan.kind === "tier" && <p className="mt-3 rounded-sm border border-noxia-violet/20 bg-noxia-violet/5 p-3 text-xs leading-5 text-noxia-ash">Un abonnement n'est pas une génération illimitée : les crédits inclus sont consommés création par création. Si ton solde tombe à zéro avant la fin de la période, l'abonnement reste actif mais les générations qui nécessitent des crédits sont bloquées. Tu peux acheter des crédits ou gagner des crédits via les récompenses disponibles.</p>}
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-noxia-ash">Durée</dt><dd className="text-right text-noxia-silver">{formatDuration(plan)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-noxia-ash">Crédits</dt><dd className="text-right text-noxia-silver">{formatCredits(plan)}</dd></div>
      </dl>
      <ul className="mt-4 flex-1 space-y-1 text-sm text-noxia-ash">{plan.features.map(f => <li key={f}>• {f}</li>)}</ul>
      {!cta
        ? <p className="mt-6 rounded-sm border border-noxia-silver/20 py-3 text-center text-sm text-noxia-ash">Plan gratuit</p>
        : <a href={cta.href} {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="mt-6 flex min-h-12 items-center justify-center rounded-sm bg-noxia-violet px-4 text-center text-sm font-medium text-white shadow-glow hover:bg-noxia-violet">{cta.label}</a>}
    </article>
  );
}
