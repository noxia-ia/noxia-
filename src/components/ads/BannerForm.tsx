"use client";
import { useActionState } from "react";
import Link from "next/link";
import { saveBannerAction } from "@/app/admin/banners/actions";
import type { AdBannerRow, BannerFormState } from "@/lib/banners";

const idle: BannerFormState = { status: "idle" };
const field = "mt-1 min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 py-2 text-base text-noxia-silver focus:border-noxia-violet";
// <input type="datetime-local"> attend « AAAA-MM-JJTHH:mm » (heure UTC ici, comme le serveur).
const local = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

export function BannerForm({ banner }: { banner?: AdBannerRow }) {
  const [state, action, pending] = useActionState(saveBannerAction, idle);
  return (
    <form action={action} className="space-y-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5" key={banner?.id ?? "new"}>
      <h2 className="font-display text-xl text-noxia-silver">{banner ? "Modifier la bande" : "Nouvelle bande"}</h2>
      {banner && <input type="hidden" name="id" value={banner.id} />}
      <label className="block text-sm text-noxia-ash">Titre
        <input name="title" required maxLength={120} defaultValue={banner?.title ?? ""} className={field} placeholder="Ex. : -20 % sur NOXIA Premium ce week-end" />
      </label>
      <label className="block text-sm text-noxia-ash">Texte (facultatif)
        <input name="body" maxLength={200} defaultValue={banner?.body ?? ""} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-noxia-ash">Lien du bouton (https://)
          <input name="link_url" type="url" required defaultValue={banner?.link_url ?? ""} className={field} placeholder="https://…" />
        </label>
        <label className="block text-sm text-noxia-ash">Texte du bouton
          <input name="cta_label" maxLength={30} defaultValue={banner?.cta_label ?? "Découvrir"} className={field} />
        </label>
        <label className="block text-sm text-noxia-ash">Image (https://, facultatif)
          <input name="image_url" type="url" defaultValue={banner?.image_url ?? ""} className={field} placeholder="https://…/image.jpg" />
        </label>
        <label className="block text-sm text-noxia-ash">Étiquette affichée
          <input name="label" maxLength={30} defaultValue={banner?.label ?? "Sponsorisé"} className={field} />
        </label>
        <label className="block text-sm text-noxia-ash">Début (heure UTC, facultatif)
          <input name="starts_at" type="datetime-local" defaultValue={local(banner?.starts_at ?? null)} className={field} />
        </label>
        <label className="block text-sm text-noxia-ash">Fin (heure UTC, facultatif)
          <input name="ends_at" type="datetime-local" defaultValue={local(banner?.ends_at ?? null)} className={field} />
        </label>
        <label className="block text-sm text-noxia-ash">Ordre d’affichage (0 = en premier)
          <input name="sort_order" type="number" min={0} max={1000} defaultValue={banner?.sort_order ?? 0} className={field} />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-noxia-silver"><input type="checkbox" name="active" defaultChecked={banner?.active ?? true} className="h-5 w-5" /> Bande active</label>
      <label className="flex min-h-11 items-center gap-3 text-sm text-noxia-silver"><input type="checkbox" name="hide_for_paid" defaultChecked={banner?.hide_for_paid ?? false} className="h-5 w-5" /> Masquer pour les abonnés payants</label>
      {state.status === "error" && <p role="alert" className="text-sm text-noxia-violet">{state.message}</p>}
      {state.status === "ok" && <p role="status" className="text-sm text-emerald-400">{state.message}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={pending} className="min-h-11 rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white disabled:opacity-60">{pending ? "Enregistrement…" : "Enregistrer"}</button>
        {banner && <Link href="/admin/banners" className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver">Annuler</Link>}
      </div>
    </form>
  );
}
