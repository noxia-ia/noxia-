import Link from "next/link";
import type { Agent } from "@/types/database";
import { PERSONALITY_LABELS, LANGUAGE_LABELS, AGENT_STATUS_LABELS } from "@/modules/agents/options";
export function AgentCard({ a }: { a: Agent }) {
  return (
    <Link href={`/dashboard/agents/${a.id}`} className={`block h-full rounded-md border border-noxia-silver/15 bg-noxia-night p-5 transition-colors hover:border-noxia-violet/60 ${a.status === "inactive" ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-full border border-noxia-silver/20 bg-noxia-night text-2xl" aria-hidden>{a.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 break-words font-display text-lg text-noxia-silver">{a.name}</h3>
            <span className={`flex-none text-xs ${a.status === "active" ? "text-noxia-violet" : "text-noxia-ash"}`}>{AGENT_STATUS_LABELS[a.status]}</span>
          </div>
          <p className="text-sm text-noxia-ash">{a.role}</p>
        </div>
      </div>
      {a.description && <p className="mt-3 line-clamp-2 break-words text-sm text-noxia-ash">{a.description}</p>}
      <p className="mt-3 text-xs text-noxia-ash">{PERSONALITY_LABELS[a.personality]} · {LANGUAGE_LABELS[a.language]}</p>
    </Link>
  );
}
