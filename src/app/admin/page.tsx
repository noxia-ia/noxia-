import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { effectiveStatus, formatDate } from "@/lib/subscription";
import { PLANS } from "@/lib/plans";
import { StatusBadge } from "@/components/subscription/StatusBadge";
import type { Profile, Subscription } from "@/types/database";

type SubRow = Pick<Subscription, "user_id" | "plan" | "status" | "expires_at">;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireAdmin();
  const q = ((await searchParams).q ?? "").replace(/[,()%*\\]/g, "").trim().slice(0, 60);

  let listQuery = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50);
  if (q) listQuery = listQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  const [{ count }, { data: subs }, { data: profiles }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("subscriptions").select("user_id,plan,status,expires_at").order("created_at", { ascending: false }).limit(5000).returns<SubRow[]>(),
    listQuery.returns<Profile[]>(),
  ]);

  const all = subs ?? [];
  const paid = all.filter(s => s.plan !== "free");
  const active = paid.filter(s => effectiveStatus(s) === "active").length;
  const expired = paid.filter(s => effectiveStatus(s) === "expired").length;
  const latest = new Map<string, SubRow>();
  all.forEach(s => { if (!latest.has(s.user_id)) latest.set(s.user_id, s); }); // tri décroissant : la 1re est la plus récente

  const stats: [string, number][] = [["Utilisateurs", count ?? 0], ["Abonnements payants", paid.length], ["Actifs", active], ["Expirés", expired]];
  return (
    <>
      <h1 className="font-display text-3xl text-noxia-silver">Espace admin</h1>
      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4"><dt className="text-xs text-noxia-ash">{k}</dt><dd className="mt-1 font-display text-2xl text-noxia-silver">{v}</dd></div>
        ))}
      </dl>
      <form action="/admin" method="get" className="mt-8 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Rechercher un nom ou un email" className="min-w-0 flex-1 rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet" />
        <button className="rounded-sm bg-noxia-violet px-5 py-3 text-sm text-white hover:bg-noxia-violet">Chercher</button>
      </form>
      <ul className="mt-5 space-y-2">
        {(profiles ?? []).map(p => {
          const s = latest.get(p.user_id) ?? null;
          return (
            <li key={p.id}>
              <Link href={`/admin/users/${p.user_id}`} className="grid gap-2 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 hover:border-noxia-violet/60 sm:grid-cols-[2fr_1fr_1fr] sm:items-center">
                <div className="min-w-0"><p className="truncate text-noxia-silver">{p.full_name || "Sans nom"}{p.role === "admin" && <span className="ml-2 text-xs text-noxia-violet">admin</span>}</p><p className="truncate text-sm text-noxia-ash">{p.email}</p></div>
                <div className="flex items-center gap-2 text-sm text-noxia-silver">{PLANS[s?.plan ?? "free"].name} <StatusBadge status={effectiveStatus(s)} /></div>
                <p className="text-sm text-noxia-ash">Exp. : {formatDate(s?.expires_at)}</p>
              </Link>
            </li>
          );
        })}
        {profiles?.length === 0 && <li className="text-noxia-ash">Aucun utilisateur trouvé.</li>}
      </ul>
    </>
  );
}
