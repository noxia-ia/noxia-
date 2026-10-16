import type { requireAdmin } from "@/lib/auth";

// Statistiques publicitaires : campagnes récompensées et bande d'annonces. RÉSERVÉ à l'administrateur : ce composant n'est utilisé que dans des pages protégées par requireAdmin(),
// et les fonctions SQL (admin_campaign_analytics, admin_banner_stats) refusent tout autre utilisateur (« forbidden »).
type Supa = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
interface CampaignRow { id: string; title: string; platform: string; status: string; reward_credits: number; max_rewards: number | null; claims: number; verified: number; rewarded: number; credits_awarded: number }
interface BannerStatRow { banner_id: string; title: string; active: boolean; impressions: number; unique_viewers: number; clicks: number; ctr: number; last_event_at: string | null }
const n = (v: unknown) => Number(v ?? 0);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" }) + " UTC" : "—");
const TH = "py-2 text-right font-normal";

export async function AdsStats({ supabase, show = "both", days = 30 }: { supabase: Supa; show?: "both" | "campaigns" | "banners"; days?: number }) {
  const [camp, ban] = await Promise.all([
    show === "banners" ? null : supabase.rpc("admin_campaign_analytics"),
    show === "campaigns" ? null : supabase.rpc("admin_banner_stats", { p_days: days }),
  ]);
  const campaigns = ((camp?.data ?? []) as CampaignRow[]);
  const banners = ((ban?.data ?? []) as BannerStatRow[]);
  const totalCredits = campaigns.reduce((s, c) => s + n(c.credits_awarded), 0);

  return (
    <div className="space-y-8">
      {show !== "banners" && (
        <section aria-label="Statistiques des campagnes" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
          <h2 className="font-display text-xl text-noxia-silver">Campagnes publicitaires</h2>
          <p className="mt-1 text-sm text-noxia-ash">Pubs récompensées regardées par les utilisateurs. {campaigns.length} campagne(s) · {totalCredits} crédits distribués au total.</p>
          {camp?.error && <p role="alert" className="mt-2 text-sm text-noxia-violet">Statistiques indisponibles.</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-noxia-silver/10 text-xs text-noxia-ash"><tr><th className="py-2 text-left font-normal">Campagne</th><th className={TH}>Statut</th><th className={TH}>Participations</th><th className={TH}>Validées</th><th className={TH}>Récompensées</th><th className={TH}>Crédits</th></tr></thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b border-noxia-silver/5">
                    <td className="py-2 text-noxia-silver">{c.title}<span className="block text-xs text-noxia-ash">{c.platform} · +{c.reward_credits} crédits{c.max_rewards ? ` · max ${c.max_rewards}` : ""}</span></td>
                    <td className="py-2 text-right text-noxia-ash">{c.status}</td><td className="py-2 text-right text-noxia-ash">{n(c.claims)}</td><td className="py-2 text-right text-noxia-ash">{n(c.verified)}</td><td className="py-2 text-right text-noxia-ash">{n(c.rewarded)}</td><td className="py-2 text-right text-noxia-silver">{n(c.credits_awarded)}</td>
                  </tr>
                ))}
                {!campaigns.length && <tr><td colSpan={6} className="py-4 text-noxia-ash">Aucune campagne.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {show !== "campaigns" && (
        <section aria-label="Statistiques de la bande d'annonces" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
          <h2 className="font-display text-xl text-noxia-silver">Bande d’annonces ({days} derniers jours)</h2>
          <p className="mt-1 text-sm text-noxia-ash">Affichages comptés une fois par utilisateur toutes les 30 minutes ; taux de clic = clics ÷ affichages. Visible par toi seul.</p>
          {ban?.error && <p role="alert" className="mt-2 text-sm text-noxia-violet">Statistiques indisponibles : la migration 0056 est-elle appliquée ?</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-noxia-silver/10 text-xs text-noxia-ash"><tr><th className="py-2 text-left font-normal">Annonce</th><th className={TH}>Affichages</th><th className={TH}>Personnes</th><th className={TH}>Clics</th><th className={TH}>Taux de clic</th><th className={TH}>Dernier événement</th></tr></thead>
              <tbody>
                {banners.map(b => (
                  <tr key={b.banner_id} className="border-b border-noxia-silver/5">
                    <td className="py-2 text-noxia-silver">{b.title}<span className="block text-xs text-noxia-ash">{b.active ? "Active" : "Désactivée"}</span></td>
                    <td className="py-2 text-right text-noxia-silver">{n(b.impressions)}</td><td className="py-2 text-right text-noxia-ash">{n(b.unique_viewers)}</td><td className="py-2 text-right text-noxia-silver">{n(b.clicks)}</td><td className="py-2 text-right text-noxia-ash">{n(b.ctr)} %</td><td className="py-2 text-right text-xs text-noxia-ash">{day(b.last_event_at)}</td>
                  </tr>
                ))}
                {!banners.length && <tr><td colSpan={6} className="py-4 text-noxia-ash">Aucune annonce.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
