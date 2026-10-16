import { requireAdmin } from "@/lib/auth";
import { updatePlanPriceAction } from "../pricing-actions";

const OFFER_PLANS = ["free", "plus", "pro", "ultra"] as const;
const CURRENCIES = ["XOF", "USD", "EUR"] as const;

export default async function AdminPricingPage() {
  const { supabase } = await requireAdmin();
  const [{ data: prices }, { data: audit }] = await Promise.all([
    supabase.from("plan_prices").select("plan,currency,amount_minor,is_reference,active,updated_at").order("plan").order("currency"),
    supabase.from("plan_price_audit").select("plan,currency,old_amount_minor,new_amount_minor,old_active,new_active,created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const rows = prices ?? [];
  const amount = (plan: string, currency: string) => {
    const r = rows.find(x => x.plan === plan && x.currency === currency);
    return r ? String(r.amount_minor) : "";
  };
  const active = (plan: string, currency: string) => rows.find(x => x.plan === plan && x.currency === currency)?.active ?? false;

  return <>
    <div>
      <h1 className="font-display text-3xl text-noxia-silver">Prix des abonnements</h1>
      <p className="mt-2 max-w-2xl text-sm text-noxia-ash">Modification réservée à l'administrateur. Les montants sont en unités mineures pour USD/EUR et en FCFA entiers pour XOF. Chaque changement est audité.</p>
    </div>
    <div className="mt-8 space-y-4">
      {OFFER_PLANS.map(plan => <section key={plan} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
        <h2 className="font-display text-xl text-noxia-silver">{plan.toUpperCase()}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {CURRENCIES.map(currency => <form key={currency} action={updatePlanPriceAction} className="space-y-3 rounded-md border border-noxia-silver/10 p-4">
            <input type="hidden" name="plan" value={plan} /><input type="hidden" name="currency" value={currency} />
            <p className="text-sm text-noxia-silver">{currency}</p>
            <input name="amount_minor" inputMode="numeric" defaultValue={amount(plan, currency)} aria-label={`${plan} ${currency}`} className="w-full rounded-sm border border-noxia-silver/20 bg-black/20 px-3 py-2 text-noxia-silver" />
            <label className="flex items-center gap-2 text-xs text-noxia-ash"><input type="checkbox" name="active" value="true" defaultChecked={active(plan, currency)} /> Actif</label>
            <button className="min-h-10 w-full rounded-sm bg-noxia-violet px-3 py-2 text-sm text-white">Enregistrer</button>
          </form>)}
        </div>
      </section>)}
    </div>
    <section className="mt-8 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
      <h2 className="font-display text-xl text-noxia-silver">Historique récent</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-noxia-silver/10 text-left text-xs text-noxia-ash"><th className="pb-2">Date</th><th className="pb-2">Plan</th><th className="pb-2">Devise</th><th className="pb-2">Ancien</th><th className="pb-2">Nouveau</th><th className="pb-2">Actif</th></tr></thead><tbody>
        {(audit ?? []).map((r, i) => <tr key={`${r.created_at}-${i}`} className="border-b border-noxia-silver/5"><td className="py-2 text-noxia-ash">{new Date(r.created_at).toLocaleString("fr-FR")}</td><td className="py-2 text-noxia-silver">{r.plan}</td><td className="py-2 text-noxia-silver">{r.currency}</td><td className="py-2 text-noxia-ash">{r.old_amount_minor ?? "—"}</td><td className="py-2 text-noxia-silver">{r.new_amount_minor}</td><td className="py-2 text-noxia-ash">{r.new_active ? "Oui" : "Non"}</td></tr>)}
        {(!audit || audit.length === 0) && <tr><td colSpan={6} className="py-4 text-noxia-ash">Aucun changement enregistré.</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
