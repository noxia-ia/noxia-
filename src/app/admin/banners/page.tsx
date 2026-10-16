import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { UUID_RE } from "@/lib/validation";
import { BANNER_COLUMNS, type AdBannerRow } from "@/lib/banners";
import { BannerForm } from "@/components/ads/BannerForm";
import { AdsStats } from "@/components/admin/AdsStats";
import { toggleBannerAction, deleteBannerAction } from "./actions";

function status(b: AdBannerRow): string {
  const now = Date.now();
  if (!b.active) return "Désactivée";
  if (b.starts_at && Date.parse(b.starts_at) > now) return "Programmée";
  if (b.ends_at && Date.parse(b.ends_at) <= now) return "Terminée";
  return "En ligne";
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "UTC" }) + " UTC" : "—");

export default async function AdminBannersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { supabase } = await requireAdmin();
  const { edit } = await searchParams;
  const { data, error } = await supabase.from("ad_banners").select(BANNER_COLUMNS).order("sort_order", { ascending: true }).order("created_at", { ascending: false }).returns<AdBannerRow[]>();
  const banners = data ?? [];
  const editing = edit && UUID_RE.test(edit) ? banners.find(b => b.id === edit) : undefined;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-noxia-silver">Bande publicitaire</h1>
        <p className="mt-2 text-sm text-noxia-ash">La bande s’affiche au-dessus de la zone de saisie du chat. Les annonces en ligne défilent de droite à gauche en boucle. Chaque utilisateur peut fermer une bande pour sa session.</p>
      </div>
      {error && <p role="alert" className="text-sm text-noxia-violet">La liste est indisponible. Lance la migration 0049 dans Supabase (SQL Editor).</p>}
      <BannerForm banner={editing} />
      <AdsStats supabase={supabase} show="banners" />
      <section aria-label="Bandes enregistrées" className="space-y-3">
        <h2 className="font-display text-xl text-noxia-silver">Bandes enregistrées ({banners.length})</h2>
        {banners.length === 0 && !error && <p className="text-sm text-noxia-ash">Aucune bande pour l’instant. Crée la première avec le formulaire ci-dessus.</p>}
        {banners.map(b => (
          <article key={b.id} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-noxia-silver">{b.title}</p>
                <p className="mt-1 break-all text-xs text-noxia-ash">{b.link_url}</p>
                <p className="mt-1 text-xs text-noxia-ash">Du {when(b.starts_at)} au {when(b.ends_at)} · ordre {b.sort_order}{b.hide_for_paid ? " · masquée pour les abonnés payants" : ""}</p>
              </div>
              <span className="rounded-full border border-noxia-silver/20 px-3 py-1 text-xs text-noxia-silver">{status(b)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/admin/banners?edit=${b.id}`} className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver">Modifier</Link>
              <form action={toggleBannerAction.bind(null, b.id, !b.active)}><button className="min-h-11 rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver">{b.active ? "Désactiver" : "Activer"}</button></form>
              <form action={deleteBannerAction.bind(null, b.id)}><button className="min-h-11 rounded-sm border border-noxia-violet/50 px-4 text-sm text-noxia-violet">Supprimer</button></form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
