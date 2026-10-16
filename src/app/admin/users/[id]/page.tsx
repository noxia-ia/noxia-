import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getCurrentSubscription, effectiveStatus, formatDate, ACTION_LABELS } from "@/lib/subscription";
import { PLANS, PAID_PLAN_IDS, formatDuration } from "@/lib/plans";
import { UUID_RE } from "@/lib/validation";
import { StatusBadge } from "@/components/subscription/StatusBadge";
import { subscriptionAction, adjustCreditsAction } from "../../actions";
import type { Profile, SubscriptionHistory } from "@/types/database";

const field = "w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver focus:border-noxia-violet";
const btn = "rounded-sm border border-noxia-silver/30 px-4 py-3 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white";

export default async function AdminUserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const { ok, err } = await searchParams;
  if (!UUID_RE.test(id)) notFound();

  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", id).maybeSingle<Profile>();
  if (!profile) notFound();
  const [sub, { data: history }] = await Promise.all([
    getCurrentSubscription(supabase, id),
    supabase.from("subscription_history").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(20).returns<SubscriptionHistory[]>(),
  ]);
  const adminIds = [...new Set((history ?? []).map(h => h.admin_id).filter((x): x is string => !!x))];
  const { data: admins } = adminIds.length
    ? await supabase.from("profiles").select("user_id,full_name,email").in("user_id", adminIds).returns<Pick<Profile, "user_id" | "full_name" | "email">[]>()
    : { data: [] as Pick<Profile, "user_id" | "full_name" | "email">[] };
  const adminName = (aid: string | null) => { const a = admins?.find(x => x.user_id === aid); return a?.full_name || a?.email || "—"; };
  const status = effectiveStatus(sub);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-noxia-ash hover:text-white">← Utilisateurs</Link>
      <h1 className="mt-3 font-display text-3xl text-noxia-silver">{profile.full_name || "Sans nom"}</h1>
      <p className="break-all text-noxia-ash">{profile.email}</p>
      {ok && <p role="status" className="mt-4 rounded-sm border border-emerald-500/40 p-3 text-sm text-emerald-400">{ok}</p>}
      {err && <p role="alert" className="mt-4 rounded-sm border border-noxia-violet/50 p-3 text-sm text-noxia-violet">{err}</p>}

      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4"><dt className="text-xs text-noxia-ash">Rôle</dt><dd className="mt-1 text-noxia-silver">{profile.role}</dd></div>
        <div className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4"><dt className="text-xs text-noxia-ash">Plan</dt><dd className="mt-1 text-noxia-silver">{PLANS[sub?.plan ?? "free"].name} <StatusBadge status={status} /></dd></div>
        <div className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4"><dt className="text-xs text-noxia-ash">Crédits</dt><dd className="mt-1 text-noxia-silver">{profile.credits}</dd></div>
        <div className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4"><dt className="text-xs text-noxia-ash">Début → expiration</dt><dd className="mt-1 text-sm text-noxia-silver">{formatDate(sub?.starts_at)} → {formatDate(sub?.expires_at)}</dd></div>
      </dl>

      <section className="mt-8 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
        <h2 className="font-display text-xl text-noxia-silver">Abonnement</h2>
        <form action={subscriptionAction} className="mt-4 space-y-3">
          <input type="hidden" name="user_id" value={id} />
          <label className="block text-sm text-noxia-ash">Plan
            <select name="plan" defaultValue={sub && sub.plan !== "free" ? sub.plan : "monthly"} className={`${field} mt-1`}>
              {PAID_PLAN_IDS.map(p => <option key={p} value={p}>{PLANS[p].name} — {formatDuration(PLANS[p])}</option>)}
            </select>
          </label>
          <label className="block text-sm text-noxia-ash">Date de début
            <input type="date" name="start_date" defaultValue={today} className={`${field} mt-1`} />
          </label>
          <label className="block text-sm text-noxia-ash">Durée en jours (obligatoire pour Plus / Pro / Ultra)
            <input type="number" name="duration_days" min={1} max={400} inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <p className="text-xs text-noxia-ash">Anciennes formules : expiration calculée d'après le plan. Plus / Pro / Ultra : durée saisie ci-dessus ; crédits d'activation à ajuster séparément (aucun crédit n'est défini pour ces plans).</p>
          <div className="grid grid-cols-2 gap-2">
            <button name="intent" value="activate" className="rounded-sm bg-noxia-violet px-4 py-3 text-sm text-white hover:bg-noxia-violet">Activer</button>
            <button name="intent" value="renew" className={btn}>Renouveler</button>
            <button name="intent" value="suspend" className={btn}>Suspendre</button>
            <button name="intent" value="expire" className={btn}>Expirer</button>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
        <h2 className="font-display text-xl text-noxia-silver">Crédits</h2>
        <form action={adjustCreditsAction} className="mt-4 flex gap-2">
          <input type="hidden" name="user_id" value={id} />
          <input type="number" name="delta" step="1" placeholder="+50 ou -10" className={`${field} min-w-0 flex-1`} />
          <button className={btn}>Ajuster</button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-xl text-noxia-silver">Historique</h2>
        <ul className="mt-3 space-y-2">
          {(history ?? []).map(h => (
            <li key={h.id} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4 text-sm">
              <p className="text-noxia-silver">{ACTION_LABELS[h.action]} · {formatDate(h.created_at)}</p>
              {h.action !== "credits" && <>
                <p className="text-noxia-ash">Plan : {h.old_plan ?? "—"} → {h.new_plan ?? "—"}</p>
                <p className="text-noxia-ash">Expiration : {formatDate(h.old_expires_at)} → {formatDate(h.new_expires_at)}</p></>}
              {h.credits_delta !== 0 && <p className="text-noxia-ash">Crédits : {h.credits_delta > 0 ? "+" : ""}{h.credits_delta}</p>}
              <p className="text-noxia-ash">Par : {adminName(h.admin_id)}</p>
            </li>
          ))}
          {history?.length === 0 && <li className="text-noxia-ash">Aucun changement enregistré.</li>}
        </ul>
      </section>
    </>
  );
}
