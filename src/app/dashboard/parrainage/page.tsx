import Link from "next/link";
import { headers } from "next/headers";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { ReferralLink } from "@/components/referral/ReferralLink";

// Onglet « Parrainage » : lien unique, copie rapide et récapitulatif des gains.
// Règles (migration 0054) : le filleul reçoit 12 + 5 = 17 crédits à l'inscription ; le parrain reçoit +10 quand l'e-mail du filleul est confirmé.
interface Summary { code: string; invited: number; validated: number; pending: number; earned: number; items: { label: string; status: "pending" | "validated"; created_at: string; bonus: number }[] }

export default async function ParrainagePage() {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return <main className="mx-auto max-w-3xl p-6"><p className="text-noxia-silver">Accès réservé aux utilisateurs vérifiés.</p></main>;
  const { data, error } = await gate.supabase.rpc("my_referral_summary");
  const s = (!error && data ? data : null) as Summary | null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const link = s?.code && host ? `${proto}://${host}/register?ref=${s.code}` : "";

  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10">
      <Link href="/dashboard" className="text-sm text-noxia-ash">← Dashboard</Link>
      <p className="mt-8 text-xs uppercase tracking-[0.25em] text-noxia-violet">PARRAINAGE</p>
      <h1 className="mt-2 font-display text-3xl tracking-widest text-noxia-silver">Invite tes amis, gagne des crédits</h1>
      <p className="mt-3 text-noxia-ash">Ton ami reçoit <strong className="text-noxia-silver">17 crédits</strong> à l'inscription (12 + 5 de bonus). Toi, tu reçois <strong className="text-noxia-silver">+10 crédits</strong> dès que son compte est validé (adresse e-mail confirmée).</p>

      {!s ? (
        <p className="mt-6 rounded-sm border border-noxia-silver/20 p-4 text-sm text-noxia-ash">Le parrainage n'est pas encore disponible : la migration 0054 doit être appliquée à la base.</p>
      ) : (
        <>
          <section className="mt-6 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">{link ? <ReferralLink link={link} code={s.code} /> : <p className="text-sm text-noxia-ash">Ton code : <span className="font-mono text-noxia-silver">{s.code}</span></p>}</section>

          <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Récapitulatif des gains">
            {[["Invités", s.invited], ["Validés", s.validated], ["En attente", s.pending], ["Crédits gagnés", s.earned]].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border border-noxia-silver/15 p-4"><strong className="block font-display text-2xl text-noxia-silver">{value}</strong><small className="text-noxia-ash">{label}</small></div>
            ))}
          </section>

          <section className="mt-5 rounded-md border border-noxia-silver/10 p-5">
            <h2 className="font-display tracking-widest text-noxia-silver">Tes filleuls</h2>
            {s.items.length === 0 ? <p className="mt-3 text-sm text-noxia-ash">Personne ne s'est encore inscrit avec ton lien. Partage-le pour commencer à gagner des crédits.</p> : (
              <ul className="mt-3 divide-y divide-noxia-silver/10">
                {s.items.map((i, k) => (
                  <li key={k} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-noxia-silver">{i.label} <span className="text-xs text-noxia-ash">· {new Date(i.created_at).toLocaleDateString("fr-FR", { timeZone: "UTC" })}</span></span>
                    <span className={i.status === "validated" ? "text-emerald-400" : "text-noxia-ash"}>{i.status === "validated" ? `+${i.bonus} crédits` : "En attente de validation"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
