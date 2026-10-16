import Link from "next/link";
import { CONVERSATION_STATUS_LABELS } from "@/modules/agents/options";
import type { AgentConversation } from "@/types/database";

export interface ConversationItem extends AgentConversation { agentName?: string; agentIcon?: string }
export function ConversationList({ items, activeId, empty }: { items: ConversationItem[]; activeId?: string | null; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-noxia-ash">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map(c => (
        <li key={c.id}>
          <Link href={`/dashboard/agents/${c.agent_id}?c=${c.id}`} className={`block rounded-md border bg-noxia-night p-3 hover:border-noxia-violet/60 ${activeId === c.id ? "border-noxia-violet/70" : "border-noxia-silver/15"}`}>
            {c.agentName && <p className="text-sm text-noxia-silver">{c.agentIcon} {c.agentName}</p>}
            <p className="line-clamp-2 break-words text-sm text-noxia-ash">{c.last_message || c.title || "Conversation"}</p>
            <p className="mt-1 text-xs text-noxia-ash">{new Date(c.last_message_at).toLocaleDateString("fr-FR")} · {CONVERSATION_STATUS_LABELS[c.status]}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
