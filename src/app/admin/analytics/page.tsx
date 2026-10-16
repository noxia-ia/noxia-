import { requireAdmin } from "@/lib/auth";
import { AdsStats } from "@/components/admin/AdsStats";
import {
  fetchAdminOverview,
  fetchMediaEngineUsage,
  fetchSignupEvolution,
} from "@/lib/admin/analytics";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4">
      <dt className="text-xs text-noxia-ash">{label}</dt>
      <dd className="mt-1 font-display text-2xl text-noxia-silver">{value}</dd>
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const { supabase } = await requireAdmin();
  const [overview, media, signups] = await Promise.all([
    fetchAdminOverview(supabase),
    fetchMediaEngineUsage(supabase, 30),
    fetchSignupEvolution(supabase, 30),
  ]);

  const plans = overview?.plans_active ?? {};
  const modules = overview?.media_by_module ?? {};
  const providers = overview?.media_by_provider ?? {};

  return (
    <>
      <h1 className="font-display text-3xl text-noxia-silver">Analytics</h1>
      <p className="mt-2 max-w-2xl text-sm text-noxia-ash">
        Statistiques macroscopiques uniquement. Aucun message, prompt ou contenu de conversation
        n&apos;est accessible depuis cet espace (architecture Zero-Knowledge).
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Inscrits" value={overview?.users_total ?? "—"} />
        <Stat label="Nouveaux (30 j)" value={overview?.new_users_30_days ?? "—"} />
        <Stat label="Actifs (30 j)" value={overview?.active_users_30_days ?? "—"} />
        <Stat label="Crédits consommés" value={overview?.credits_consumed ?? "—"} />
        <Stat label="Crédits (30 j)" value={overview?.credits_consumed_30_days ?? "—"} />
        <Stat label="Générations totales" value={overview?.generations_total ?? "—"} />
        <Stat label="Réussies" value={overview?.generations_completed ?? "—"} />
        <Stat label="Échouées" value={overview?.generations_failed ?? "—"} />
        <Stat label="Âge vérifié" value={overview?.age_verified_users ?? "—"} />
        <Stat label="Âge non vérifié" value={overview?.age_unverified_users ?? "—"} />
        <Stat label="Récompenses daily" value={overview?.daily_claims ?? "—"} />
        <Stat label="Crédits pubs" value={overview?.rewarded_ad_credits ?? "—"} />
      </dl>

      <section className="mt-10 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
        <h2 className="font-display text-lg text-noxia-silver">Répartition par plan (actifs)</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {Object.entries(plans).length === 0 && (
            <li className="text-sm text-noxia-ash">Aucune donnée.</li>
          )}
          {Object.entries(plans).map(([plan, n]) => (
            <li
              key={plan}
              className="flex items-center justify-between rounded border border-noxia-silver/10 px-3 py-2 text-sm"
            >
              <span className="capitalize text-noxia-silver">{plan}</span>
              <span className="text-noxia-ash">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
        <h2 className="font-display text-lg text-noxia-silver">
          Utilisation des moteurs médias (30 j)
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-noxia-silver/10 text-left text-xs text-noxia-ash">
                <th className="pb-2">Module</th>
                <th className="pb-2">Fournisseur</th>
                <th className="pb-2 text-right">Générations</th>
                <th className="pb-2 text-right">OK</th>
                <th className="pb-2 text-right">Échecs</th>
                <th className="pb-2 text-right">Crédits</th>
                <th className="pb-2 text-right">Part</th>
              </tr>
            </thead>
            <tbody>
              {media.map((r) => (
                <tr key={`${r.module}-${r.provider}`} className="border-b border-noxia-silver/5">
                  <td className="py-2 text-noxia-silver">{r.module}</td>
                  <td className="py-2 text-noxia-ash">{r.provider}</td>
                  <td className="py-2 text-right text-noxia-silver">{r.generations}</td>
                  <td className="py-2 text-right text-noxia-silver">{r.completed}</td>
                  <td className="py-2 text-right text-noxia-ash">{r.failed}</td>
                  <td className="py-2 text-right text-noxia-silver">{r.credits_used}</td>
                  <td className="py-2 text-right text-noxia-ash">{r.share_pct.toFixed(1)}%</td>
                </tr>
              ))}
              {media.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-noxia-ash">
                    Aucune génération sur la période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
          <h2 className="font-display text-lg text-noxia-silver">Par module (cumul)</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {Object.entries(modules).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="text-noxia-silver">{k}</span>
                <span className="text-noxia-ash">{v}</span>
              </li>
            ))}
            {Object.keys(modules).length === 0 && (
              <li className="text-noxia-ash">Aucune donnée.</li>
            )}
          </ul>
        </section>
        <section className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
          <h2 className="font-display text-lg text-noxia-silver">Par fournisseur (cumul)</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {Object.entries(providers).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="text-noxia-silver">{k}</span>
                <span className="text-noxia-ash">{v}</span>
              </li>
            ))}
            {Object.keys(providers).length === 0 && (
              <li className="text-noxia-ash">Aucune donnée.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-8 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
        <h2 className="font-display text-lg text-noxia-silver">Évolution des inscriptions (30 j)</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-noxia-silver/10 text-left text-xs text-noxia-ash">
                <th className="pb-2">Jour</th>
                <th className="pb-2 text-right">Inscriptions</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.day} className="border-b border-noxia-silver/5">
                  <td className="py-2 text-noxia-silver">{s.day}</td>
                  <td className="py-2 text-right text-noxia-ash">{s.signups}</td>
                </tr>
              ))}
              {signups.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 text-noxia-ash">
                    Aucune donnée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="mt-8"><AdsStats supabase={supabase} /></div>
    </>
  );
}
