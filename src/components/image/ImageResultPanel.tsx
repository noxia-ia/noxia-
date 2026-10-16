import type { ImageDisplay } from "@/modules/image/types";
import { STYLE_LABELS, RATIO_LABELS, QUALITY_LABELS, FORMAT_LABELS, STATUS_LABELS } from "@/modules/image/options";

const NOTES: Record<string, string> = { pending: "Préparation de ta demande…", processing: "Ton image est en cours de création. Actualise-la depuis l'historique." };

export function ImageResultPanel({ item }: { item: ImageDisplay | null }) {
  if (!item) return <p className="text-sm text-noxia-ash">Le résultat de ton image apparaîtra ici.</p>; // état « vide »
  const p = item.params;
  const rows: [string, string][] = [
    ["Statut", STATUS_LABELS[item.status] ?? item.status],
    ["Date", new Date(item.createdAt).toLocaleString("fr-FR")],
    ...(p ? ([["Style", STYLE_LABELS[p.style]], ["Ratio", RATIO_LABELS[p.ratio]], ["Qualité", QUALITY_LABELS[p.quality]], ["Images", String(p.count)], ["Format", FORMAT_LABELS[p.format]]] as [string, string][]) : []),
  ];
  return (
    <div className="min-w-0 space-y-4">
      {NOTES[item.status] && <p role="status" className="text-sm text-amber-400">{NOTES[item.status]}</p>}
      {item.status === "failed" && <p role="alert" className="text-sm text-noxia-violet">{item.error ?? "La génération a échoué."}</p>}
      {item.result && (
        <div className={`grid gap-3 ${item.result.images.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {item.result.images.map((img, i) => (
            <figure key={i} className="min-w-0 space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.storedUrl ?? img.url} alt={item.prompt} className="h-auto max-w-full rounded-sm bg-noxia-night" />
              {!img.storedUrl && <p className="text-xs text-noxia-ash">Lien temporaire du fournisseur : télécharge ton résultat pour le conserver.</p>}
              <figcaption className="text-xs text-noxia-ash">{img.width && img.height ? `${img.width}×${img.height} · ` : ""}{img.mimeType}</figcaption>
              <a href={img.storedUrl ?? img.url} download target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Télécharger</a>
            </figure>
          ))}
        </div>
      )}
      <p className="break-words text-noxia-silver">{item.prompt}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-noxia-ash">{k}</dt><dd className="text-noxia-silver">{v}</dd></div>)}
      </dl>
    </div>
  );
}
