import type { VideoDisplay } from "@/modules/video/types";
import { STYLE_LABELS, FORMAT_LABELS, QUALITY_LABELS, CAMERA_LABELS, MOTION_LABELS, STATUS_LABELS } from "@/modules/video/options";

const NOTES: Record<string, string> = { pending: "Ta demande est en attente de traitement.", processing: "Ta vidéo est en cours de création. Actualise-la depuis l'historique." };

export function VideoResultPanel({ item, canUnwatermarkedVideo = false }: { item: VideoDisplay | null; canUnwatermarkedVideo?: boolean }) {
  if (!item) return <p className="text-sm text-noxia-ash">Le résultat de ta vidéo apparaîtra ici.</p>; // état « empty »
  const a = item.result?.asset;
  const managedDownload = typeof a?.storedUrl === "string" && a.storedUrl.startsWith("/api/media/video?path=");
  const p = item.params;
  const rows: [string, string][] = [
    ["Statut", STATUS_LABELS[item.status] ?? item.status],
    ["Date", new Date(item.createdAt).toLocaleString("fr-FR")],
    ...(p ? ([["Style", STYLE_LABELS[p.style]], ["Durée", `${p.durationSeconds} s`], ["Format", FORMAT_LABELS[p.format]], ["Qualité", QUALITY_LABELS[p.quality]], ["Caméra", CAMERA_LABELS[p.camera]], ["Mouvement", MOTION_LABELS[p.motion]]] as [string, string][]) : []),
  ];
  return (
    <div className="min-w-0 space-y-4">
      {NOTES[item.status] && <p role="status" className="text-sm text-amber-400">{NOTES[item.status]}</p>}
      {item.status === "failed" && <p role="alert" className="text-sm text-noxia-violet">{item.error ?? "La génération a échoué."}</p>}
      {a && <video controls playsInline preload="metadata" poster={a.thumbnailUrl} src={a.storedUrl ?? a.url} className="max-h-[70vh] w-full rounded-sm bg-noxia-night" />}
      {a && <p className="text-sm text-noxia-ash">{a.durationSeconds ? `${a.durationSeconds} s · ` : ""}{a.width && a.height ? `${a.width}×${a.height} · ` : ""}{a.format ? `${FORMAT_LABELS[a.format]} · ` : ""}{a.mimeType}</p>}
      {managedDownload && <div className="flex flex-wrap gap-2">
        <a href={`${a.storedUrl}&download=1&filingram=1`} className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Télécharger avec Filingram</a>
        {canUnwatermarkedVideo ? <a href={`${a.storedUrl}&download=1&filingram=0`} className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Télécharger sans Filingram</a> : <a href="/dashboard/abonnements" className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/20 px-4 text-sm text-noxia-ash">Sans Filingram · Abonnement</a>}
      </div>}
      {a && !managedDownload && <p className="text-xs text-noxia-ash">Le fichier n’est pas encore disponible dans le stockage privé NOXIA pour le téléchargement sécurisé.</p>}
      <p className="break-words text-noxia-silver">{item.prompt}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-noxia-ash">{k}</dt><dd className="text-noxia-silver">{v}</dd></div>)}
      </dl>
    </div>
  );
}
