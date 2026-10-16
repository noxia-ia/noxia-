import Link from "next/link";
import type { NoxiaModule } from "@/types";
export function ModuleCard({ m, linked = true }: { m: NoxiaModule; linked?: boolean }) {
  const card = (
    <article className="h-full rounded-md border border-noxia-silver/15 bg-noxia-night p-6 transition-colors hover:border-violet-400/60">
      <div className="text-3xl" aria-hidden>{m.icon}</div>
      <h3 className="mt-4 font-display text-xl text-noxia-silver">{m.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-noxia-ash">{m.description}</p>
      <p className="mt-4 text-xs text-violet-300">{m.status === "soon" ? "Disponible prochainement" : "Ouvrir l'interface →"}</p>
    </article>
  );
  return linked ? <Link href={m.href} className="block">{card}</Link> : card;
}
