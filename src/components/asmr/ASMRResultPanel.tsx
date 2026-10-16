import type { ASMRDisplay } from "@/modules/asmr/types";
import { TYPE_LABELS, STYLE_LABELS, AMBIANCE_LABELS, FORMAT_LABELS, STATUS_LABELS } from "@/modules/asmr/options";

const NOTES: Record<string, string> = { pending: "Ta demande est en attente de traitement.", processing: "Ta création est en cours. Actualise-la depuis l'historique." };

export function ASMRResultPanel({ item }: { item: ASMRDisplay | null }) {
  if (!item) return <p className="text-sm text-noxia-ash">Le résultat de ta création apparaîtra ici.</p>;
  const a = item.result?.asset;
  const p = item.params;
  const rows: [string, string][] = [
    ["Statut", STATUS_LABELS[item.status] ?? item.status],
    ["Date", new Date(item.createdAt).toLocaleString("fr-FR")],
    ...(p ? ([["Type", TYPE_LABELS[p.type]], ["Style", STYLE_LABELS[p.style]], ["Ambiance", AMBIANCE_LABELS[p.ambiance]], ["Durée", `${p.durationSeconds} s`], ["Format", FORMAT_LABELS[p.format]]] as [string, string][]) : []),
  ];
  return (
    <div className="min-w-0 space-y-4">
      {NOTES[item.status] && <p role="status" className="text-sm text-amber-400">{NOTES[item.status]}</p>}
      {a?.kind === "video" && <video controls playsInline preload="metadata" src={a.storedUrl ?? a.url} className="max-h-[70vh] w-full rounded-sm bg-noxia-night" />}
      {a?.kind === "audio" && <audio controls src={a.storedUrl ?? a.url} className="w-full" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {a?.kind === "image" && <img src={a.storedUrl ?? a.url} alt={item.prompt} className="h-auto max-w-full rounded-sm" />}
      {a && (
        <p className="text-sm text-noxia-ash">
          {a.durationSeconds ? `${a.durationSeconds} s · ` : ""}{a.width && a.height ? `${a.width}×${a.height} · ` : ""}{a.mimeType}
        </p>
      )}
      {a && <a href={a.storedUrl ?? a.url} download target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Télécharger</a>}
      {a && !a.storedUrl && <p className="text-xs text-noxia-ash">Lien temporaire du fournisseur : télécharge ton résultat pour le conserver.</p>}
      {item.error && <p role="alert" className="text-sm text-noxia-violet">{item.error}</p>}
      <p className="break-words text-noxia-silver">{item.prompt}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-noxia-ash">{k}</dt><dd className="text-noxia-silver">{v}</dd></div>)}
      </dl>
    </div>
  );
}
