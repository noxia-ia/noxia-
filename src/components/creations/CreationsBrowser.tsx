"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { loadMoreCreationsAction, deleteCreationAction } from "@/app/dashboard/creations/actions";
import { formatCreationDate, type Creation, type CreationTab } from "@/lib/creations";

const ICONS: Record<string, string> = { conversation: "💬", code: "💻", image: "🖼️", video: "🎬", audio: "🎧", asmr: "🎞️", music: "🎵" };
const EMPTY: Record<string, string> = {
  all: "Tu n'as encore rien créé. Lance une création depuis le menu : elle apparaîtra ici.",
  series: "Les mini-séries NOXIA arrivent bientôt. Tu les retrouveras ici.",
};
const btn = "inline-flex min-h-11 items-center justify-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white disabled:opacity-60";

export function CreationsBrowser({ tab, initialItems, initialCursor, initialError, canUnwatermarkedVideo }: { tab: CreationTab; initialItems: Creation[]; initialCursor: string | null; initialError: boolean; canUnwatermarkedVideo: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState(initialError);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const more = () => cursor && start(async () => {
    const r = await loadMoreCreationsAction(tab, cursor);
    if (!r.ok) { setError(true); return; }
    setError(false);
    setItems(prev => { const seen = new Set(prev.map(p => p.key)); return [...prev, ...r.items.filter(i => !seen.has(i.key))]; });
    setCursor(r.nextCursor);
  });
  const remove = (c: Creation) => start(async () => {
    const r = await deleteCreationAction(c.source, c.id);
    setConfirming(null);
    if (r.ok) { setItems(prev => prev.filter(p => p.key !== c.key)); setNote("Création supprimée."); } else setNote(r.message);
  });

  return (
    <section className="mt-6" aria-live="polite">
      {note && <p role="status" className="mb-4 rounded-sm border border-noxia-silver/20 p-3 text-sm text-noxia-silver">{note}</p>}
      {error && <p role="alert" className="mb-4 text-sm text-noxia-violet">Impossible de charger tes créations pour le moment. Réessaie dans quelques instants.</p>}
      {!error && items.length === 0 && <p className="rounded-md border border-noxia-silver/15 bg-noxia-night p-6 text-noxia-ash">{EMPTY[tab] ?? "Aucune création dans cette catégorie pour le moment."}</p>}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(c => (
          <li key={c.key} className="flex min-w-0 flex-col overflow-hidden rounded-md border border-noxia-silver/15 bg-noxia-night">
            <div className="grid aspect-video w-full place-items-center overflow-hidden bg-black/30 text-4xl" aria-hidden>
              {c.mediaKind === "image" && c.mediaUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.mediaUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                : ICONS[c.category]}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
              <div className="min-w-0">
                <p className="text-xs text-noxia-violet">{c.typeLabel}{c.agentName ? ` · ${c.agentName}` : ""}{c.fileCount ? ` · ${c.fileCount} fichier${c.fileCount > 1 ? "s" : ""}` : ""}</p>
                <h2 className="mt-1 line-clamp-2 break-words text-sm text-noxia-silver">{c.title}</h2>
                <p className="mt-1 text-xs text-noxia-ash">{formatCreationDate(c.createdAt)} · {c.statusLabel}</p>
                {c.mediaKind === null && c.source === "generation" && c.status === "completed" && c.category !== "code" && <p className="mt-1 text-xs text-noxia-ash">Fichier non conservé : il n'est plus disponible.</p>}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {c.openHref && (c.mediaUrl
                  ? <a href={c.openHref} target="_blank" rel="noopener noreferrer" className={btn}>Ouvrir</a>
                  : <Link href={c.openHref} className={btn}>Ouvrir</Link>)}
                {c.downloadUrl && c.mediaKind !== "video" && <a href={c.downloadUrl} className={btn}>Télécharger</a>}
                {c.downloadUrl && c.mediaKind === "video" && <>
                  <a href={`${c.mediaUrl}&download=1&filingram=1`} className={btn}>Télécharger avec Filingram</a>
                  {canUnwatermarkedVideo ? <a href={`${c.mediaUrl}&download=1&filingram=0`} className={btn}>Sans Filingram</a> : <Link href="/dashboard/abonnements" className={`${btn} opacity-80`}>Sans Filingram · Abonnement</Link>}
                </>}
                {c.deletable && (confirming === c.key
                  ? <>
                      <button onClick={() => remove(c)} disabled={pending} className={`${btn} border-noxia-violet text-white`}>Confirmer</button>
                      <button onClick={() => setConfirming(null)} disabled={pending} className={btn}>Annuler</button>
                    </>
                  : <button onClick={() => { setNote(null); setConfirming(c.key); }} disabled={pending} className={btn} aria-label={`Supprimer : ${c.title}`}>Supprimer</button>)}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {cursor && <div className="mt-6 flex justify-center"><button onClick={more} disabled={pending} className={btn}>{pending ? "Chargement…" : "Charger plus"}</button></div>}
    </section>
  );
}
