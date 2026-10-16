import { requireAdmin } from "@/lib/auth";

type Breakdown = { value: string; users: number; pct: number };
type CampaignStat = { id: string; title: string; platform: string; status: string; reward_credits: number; max_rewards: number | null; claims: number; verified: number; rewarded: number; credits_awarded: number };
type SignupPoint = { day: string; signups: number };

const labelCountry = (v: string) => v === "unknown" ? "Pays non renseigné" : v;
const labelLocale = (v: string) => ({ fr: "Français", en: "English" }[v] ?? v);
const labelCurrency = (v: string) => ({ XOF: "FCFA", USD: "USD", EUR: "EUR" }[v] ?? v);
const pct = (n: number) => `${Number.isFinite(n) ? n.toFixed(1) : "0.0"}%`;

function BreakdownTable({ title, rows, mapLabel }: { title: string; rows: Breakdown[]; mapLabel: (v: string) => string }) {
  return <section className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
    <h2 className="font-display text-lg text-noxia-silver">{title}</h2>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm"><thead><tr className="border-b border-noxia-silver/10 text-left text-xs text-noxia-ash"><th className="pb-2">Valeur</th><th className="pb-2 text-right">Utilisateurs</th><th className="pb-2 text-right">Part</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.value} className="border-b border-noxia-silver/5"><td className="py-3 text-noxia-silver">{mapLabel(r.value)}</td><td className="py-3 text-right text-noxia-silver">{r.users}</td><td className="py-3 text-right text-noxia-ash">{pct(r.pct)}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={3} className="py-4 text-noxia-ash">Aucune donnée.</td></tr>}</tbody></table>
    </div>
  </section>;
}

export default async function AdminAnalyticsPage() {
  const { supabase } = await requireAdmin();
  const [{ count: totalUsers }, { data: overview }, { data: countries, error: countryError }, { data: locales }, { data: currencies }, { data: campaignRows, error: campaignError }, { data: signupRows, error: signupError }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.rpc("admin_analytics_overview"),
    supabase.rpc("admin_audience_breakdown", { p_dimension: "country" }),
    supabase.rpc("admin_audience_breakdown", { p_dimension: "locale" }),
    supabase.rpc("admin_audience_breakdown", { p_dimension: "currency" }),
    supabase.rpc("admin_campaign_analytics"),
    supabase.rpc("admin_signup_evolution", { p_days: 30 }),
  ]);
  const campaignStats = (campaignRows ?? []) as CampaignStat[];
  const signupStats = (signupRows ?? []) as SignupPoint[];
  const maxSignups = Math.max(1, ...signupStats.map((x) => Number(x.signups || 0)));
  const o = (overview ?? {}) as Record<string, unknown>;
  const plans = (o.plans_active ?? {}) as Record<string, unknown>;
  const rewardedCredits = campaignStats.reduce((sum, c) => sum + Number(c.credits_awarded || 0), 0);
  const rewardedClaims = campaignStats.reduce((sum, c) => sum + Number(c.rewarded || 0), 0);
  const campaignUsers = campaignStats.reduce((sum, c) => sum + Number(c.claims || 0), 0);
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-3xl text-noxia-silver">Analytics NOXIA</h1><p className="mt-2 text-sm text-noxia-ash">Vue réservée à l’administration. Les répartitions d’audience sont agrégées et ne révèlent aucune donnée individuelle.</p></div>
      <span className="rounded-sm border border-noxia-violet/30 bg-noxia-violet/10 px-3 py-2 text-xs text-noxia-silver">Admin uniquement</span>
    </div>
    <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {[['Utilisateurs total', totalUsers ?? 0], ['Nouveaux / 30 j', Number(o.new_users_30_days ?? 0)], ['Actifs / 30 j', Number(o.active_users_30_days ?? 0)], ['Générations', Number(o.generations_total ?? 0)], ['Terminées', Number(o.generations_completed ?? 0)], ['Échecs', Number(o.generations_failed ?? 0)], ['Crédits consommés', Number(o.credits_consumed ?? 0)], ['Crédits fidélité distribués', Number(o.daily_credits_distributed ?? 0)], ['Réclamations campagne', campaignUsers], ['Récompenses pub validées', Number(o.rewarded_ad_claims ?? rewardedClaims)], ['Crédits pub distribués', Number(o.rewarded_ad_credits ?? rewardedCredits)]].map(([k,v]) => <div key={String(k)} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4"><dt className="text-xs text-noxia-ash">{k}</dt><dd className="mt-1 font-display text-2xl text-noxia-silver">{v}</dd></div>)}
    </dl>
    <section className="mt-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-display text-lg text-noxia-silver">Évolution des inscriptions</h2><p className="mt-1 text-xs text-noxia-ash">30 derniers jours · agrégé par jour</p></div>{signupError && <span className="text-xs text-amber-300">Migration analytics à appliquer.</span>}</div>
      <div className="mt-5 grid grid-cols-10 items-end gap-1 sm:grid-cols-[repeat(15,minmax(0,1fr))] md:grid-cols-[repeat(30,minmax(0,1fr))]" aria-label="Inscriptions quotidiennes">
        {signupStats.map((p) => <div key={p.day} title={`${p.day} · ${p.signups} inscription${p.signups > 1 ? "s" : ""}`} className="group flex min-w-0 flex-col items-center gap-1"><div className="w-full rounded-t bg-noxia-violet/70 transition-opacity group-hover:opacity-100" style={{ height: `${Math.max(4, (Number(p.signups) / maxSignups) * 96)}px` }} /><span className="text-[9px] text-noxia-ash">{p.day.slice(8)}</span></div>)}
        {signupStats.length === 0 && <p className="col-span-full py-4 text-sm text-noxia-ash">Aucune donnée disponible.</p>}
      </div>
    </section>
    <section className="mt-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
      <h2 className="font-display text-lg text-noxia-silver">Abonnements actifs</h2>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {['free','plus','pro','ultra'].map(plan => <span key={plan} className="rounded-full border border-noxia-silver/15 px-3 py-2 text-noxia-silver">{plan.toUpperCase()} : {Number(plans[plan] ?? 0)}</span>)}
      </div>
    </section>
    {countryError && <p className="mt-4 rounded-sm border border-amber-500/30 p-3 text-sm text-amber-300">Les répartitions d’audience ne sont pas disponibles. Vérifie que la migration 0026 est appliquée.</p>}
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      <BreakdownTable title="Audience par pays" rows={(countries ?? []) as Breakdown[]} mapLabel={labelCountry} />
      <BreakdownTable title="Audience par langue" rows={(locales ?? []) as Breakdown[]} mapLabel={labelLocale} />
      <BreakdownTable title="Audience par devise" rows={(currencies ?? []) as Breakdown[]} mapLabel={labelCurrency} />
    </div>
    <section className="mt-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
      <h2 className="font-display text-lg text-noxia-silver">Performance des campagnes</h2>
      <p className="mt-1 text-sm text-noxia-ash">Ces statistiques sont destinées à l’administrateur pour répondre aux demandes des entreprises.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-noxia-silver/10 text-left text-xs text-noxia-ash"><th className="pb-2">Campagne</th><th className="pb-2">Plateforme</th><th className="pb-2">Statut</th><th className="pb-2 text-right">Réclamations</th><th className="pb-2 text-right">Vérifiées</th><th className="pb-2 text-right">Récompensées</th><th className="pb-2 text-right">Crédits</th></tr></thead><tbody>
        {campaignStats.map(c => <tr key={c.id} className="border-b border-noxia-silver/5"><td className="py-3 text-noxia-silver">{c.title}</td><td className="py-3 text-noxia-ash">{c.platform}</td><td className="py-3 text-noxia-ash">{c.status}</td><td className="py-3 text-right text-noxia-silver">{c.claims}</td><td className="py-3 text-right text-noxia-silver">{c.verified}</td><td className="py-3 text-right text-noxia-silver">{c.rewarded}</td><td className="py-3 text-right text-noxia-silver">{c.credits_awarded}</td></tr>)}
        {campaignStats.length === 0 && <tr><td colSpan={7} className="py-4 text-noxia-ash">Aucune campagne disponible.</td></tr>}
      </tbody></table></div>
      {campaignError && <p className="mt-3 text-xs text-amber-300">Les statistiques de campagnes nécessitent la migration analytics dédiée.</p>}
    </section>
  </>;
}
