"use client";
import type { HistoryItem } from "@/modules/code/types";
const STATUS: Record<string, string> = { pending: "En attente", processing: "En cours", completed: "Terminée", failed: "Échec" };

export function HistoryList({ items, error, activeId, onSelect }: { items: HistoryItem[]; error: boolean; activeId?: string; onSelect: (i: HistoryItem) => void }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl text-noxia-silver">Historique</h2>
      {error && <p className="mt-3 text-sm text-noxia-ash">Historique indisponible pour le moment.</p>}
      {!error && items.length === 0 && <p className="mt-3 text-sm text-noxia-ash">Aucune génération pour le moment.</p>}
      <ul className="mt-3 space-y-2">
        {items.map(i => (
          <li key={i.id} className={`rounded-md border bg-noxia-night p-4 ${activeId === i.id ? "border-noxia-violet/70" : "border-noxia-silver/15"}`}>
            <p className="line-clamp-2 break-words text-sm text-noxia-silver">{i.prompt || "—"}</p>
            <p className="mt-1 text-xs text-noxia-ash">{new Date(i.created_at).toLocaleDateString("fr-FR")} · {STATUS[i.status] ?? i.status} · {i.credits_used} crédit(s)</p>
            {i.result && <button onClick={() => onSelect(i)} className="mt-2 min-h-11 text-sm text-noxia-violet underline">Voir le résultat</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
