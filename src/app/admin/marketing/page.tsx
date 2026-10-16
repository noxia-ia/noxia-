import { requireAdmin } from "@/lib/auth";
import { fetchMarketingAnalytics, formatCents } from "@/lib/admin/marketing";
import { MarketingForms } from "./MarketingForms";

export default async function AdminMarketingPage() {
  const { supabase } = await requireAdmin();
  const analytics = await fetchMarketingAnalytics(supabase, 30);
  const t = analytics.totals;

  return (
    <>
      <h1 className="font-display text-3xl text-noxia-silver">Marketing & publicités</h1>
      <p className="mt-2 max-w-2xl text-sm text-noxia-ash">
        Suivi des campagnes d&apos;acquisition : coûts, clics, conversions, CAC et taux par source.
        Aucune donnée de conversation n&apos;est utilisée.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Dépenses (30 j)", formatCents(t.spend_cents)],
          ["Impressions", t.impressions],
          ["Clics", t.clicks],
          ["Inscriptions", t.signups],
          ["Conversions payantes", t.paid_conversions],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4">
            <dt className="text-xs text-noxia-ash">{label}</dt>
            <dd className="mt-1 font-display text-xl text-noxia-silver">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
        <h2 className="font-display text-lg text-noxia-silver">ROI / performance par source</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-noxia-silver/10 text-left text-xs text-noxia-ash">
                <th className="pb-2">Source</th>
                <th className="pb-2">Canal</th>
                <th className="pb-2 text-right">Dépenses</th>
                <th className="pb-2 text-right">Clics</th>
                <th className="pb-2 text-right">CTR</th>
                <th className="pb-2 text-right">Inscrits</th>
                <th className="pb-2 text-right">CVR</th>
                <th className="pb-2 text-right">CAC</th>
                <th className="pb-2 text-right">Payants</th>
                <th className="pb-2 text-right">CVR payant</th>
              </tr>
            </thead>
            <tbody>
              {analytics.sources.map((s) => (
                <tr key={s.code} className="border-b border-noxia-silver/5">
                  <td className="py-2 text-noxia-silver">{s.label}</td>
                  <td className="py-2 text-noxia-ash">{s.channel}</td>
                  <td className="py-2 text-right text-noxia-silver">{formatCents(s.spend_cents)}</td>
                  <td className="py-2 text-right text-noxia-ash">{s.clicks}</td>
                  <td className="py-2 text-right text-noxia-ash">{s.ctr_pct.toFixed(1)}%</td>
                  <td className="py-2 text-right text-noxia-silver">{s.signups}</td>
                  <td className="py-2 text-right text-noxia-ash">{s.cvr_pct.toFixed(1)}%</td>
                  <td className="py-2 text-right text-noxia-silver">
                    {s.cac_cents == null ? "—" : formatCents(s.cac_cents)}
                  </td>
                  <td className="py-2 text-right text-noxia-silver">{s.paid_conversions}</td>
                  <td className="py-2 text-right text-noxia-ash">{s.paid_cvr_pct.toFixed(1)}%</td>
                </tr>
              ))}
              {analytics.sources.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-4 text-noxia-ash">
                    Aucune source. Ajoute une source et des dépenses ci-dessous.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8">
        <MarketingForms sources={analytics.sources.map((s) => s.code)} />
      </div>
    </>
  );
}
