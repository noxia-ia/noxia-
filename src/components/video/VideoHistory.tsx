"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshVideoJobAction } from "@/app/dashboard/video/actions";
import type { VideoDisplay } from "@/modules/video/types";
import { STATUS_LABELS } from "@/modules/video/options";

export function VideoHistory({ items, error, activeId, onSelect }: { items: VideoDisplay[]; error: boolean; activeId?: string; onSelect: (i: VideoDisplay) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const refresh = (id: string) => start(async () => { setNote({ id, text: (await refreshVideoJobAction(id)).message }); router.refresh(); });
  // Suivi automatique : tant qu'une vidéo est « en cours » (tâche de fond), on interroge son avancement toutes les 10 s (onglet visible seulement).
  useEffect(() => {
    const running = items.filter(i => i.status === "processing").map(i => i.id);
    if (!running.length) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      start(async () => { for (const id of running) await refreshVideoJobAction(id); router.refresh(); });
    }, 10_000);
    return () => clearInterval(t);
  }, [items, router]);
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl text-noxia-silver">Historique</h2>
      {error && <p className="mt-3 text-sm text-noxia-ash">Historique indisponible (les migrations 0003 à 0005 ont-elles été exécutées ?).</p>}
      {!error && items.length === 0 && <p className="mt-3 text-sm text-noxia-ash">Vous n'avez encore aucune vidéo.</p>}
      <ul className="mt-3 space-y-2">
        {items.map(i => {
          const a = i.result?.asset;
          return (
            <li key={i.id} className={`flex gap-3 rounded-md border bg-noxia-night p-4 ${activeId === i.id ? "border-noxia-violet/70" : "border-noxia-silver/15"}`}>
              <div className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-sm bg-noxia-night text-2xl" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a?.thumbnailUrl ? <img src={a.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : "🎬"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-sm text-noxia-silver">{i.prompt}</p>
                <p className="mt-1 text-xs text-noxia-ash">{new Date(i.createdAt).toLocaleDateString("fr-FR")} · {STATUS_LABELS[i.status] ?? i.status}{(a?.durationSeconds ?? i.params?.durationSeconds) ? ` · ${a?.durationSeconds ?? i.params?.durationSeconds} s` : ""}</p>
                <div className="flex flex-wrap gap-x-4">
                  {i.result && <button onClick={() => onSelect(i)} className="min-h-11 text-sm text-noxia-violet underline">Voir</button>}
                  {i.status === "processing" && <button disabled={pending} onClick={() => refresh(i.id)} className="min-h-11 text-sm text-noxia-violet underline disabled:opacity-60">Actualiser</button>}
                </div>
                {note?.id === i.id && <p role="status" className="text-xs text-amber-400">{note.text}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
