"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshImageJobAction } from "@/app/dashboard/image/actions";
import type { ImageDisplay } from "@/modules/image/types";
import { STATUS_LABELS, FORMAT_LABELS } from "@/modules/image/options";

export function ImageHistory({ items, error, activeId, onSelect }: { items: ImageDisplay[]; error: boolean; activeId?: string; onSelect: (i: ImageDisplay) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const refresh = (id: string) => start(async () => { setNote({ id, text: (await refreshImageJobAction(id)).message }); router.refresh(); });
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl text-noxia-silver">Historique</h2>
      {error && <p className="mt-3 text-sm text-noxia-ash">Historique indisponible (les migrations 0003, 0005 et 0007 ont-elles été exécutées ?).</p>}
      {!error && items.length === 0 && <p className="mt-3 text-sm text-noxia-ash">Vous n'avez encore aucune image.</p>}
      <ul className="mt-3 space-y-2">
        {items.map(i => {
          const first = i.result?.images[0];
          const dims = first?.width && first?.height ? `${first.width}×${first.height}` : null;
          return (
            <li key={i.id} className={`flex gap-3 rounded-md border bg-noxia-night p-4 ${activeId === i.id ? "border-noxia-violet/70" : "border-noxia-silver/15"}`}>
              <div className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-sm bg-noxia-night text-2xl" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {first ? <img src={first.thumbnailUrl ?? first.url} alt="" className="h-full w-full object-cover" /> : "🖼️"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-sm text-noxia-silver">{i.prompt}</p>
                <p className="mt-1 text-xs text-noxia-ash">{new Date(i.createdAt).toLocaleDateString("fr-FR")} · {STATUS_LABELS[i.status] ?? i.status}{dims ? ` · ${dims}` : ""}{i.params ? ` · ${FORMAT_LABELS[i.params.format]}` : ""}</p>
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
