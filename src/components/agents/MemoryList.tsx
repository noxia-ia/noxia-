"use client";

import { useTransition } from "react";
import { forgetMemoryAction } from "@/app/dashboard/agents/memory-actions";
import type { AgentMemory } from "@/lib/agent-memory";

export function MemoryList({ agentId, items }: { agentId: string; items: AgentMemory[] }) {
  const [pending, start] = useTransition();
  if (items.length === 0) return <p className="text-sm text-noxia-ash">Aucune mémoire enregistrée. Utilise « Mémoriser » sur un message que tu veux conserver.</p>;
  return <ul className="space-y-2">{items.map(item => <li key={item.id} className="flex gap-3 rounded-md border border-noxia-silver/10 bg-noxia-night p-3"><p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-noxia-silver">{item.content}</p><button type="button" disabled={pending} onClick={() => start(async () => { await forgetMemoryAction(agentId, item.id); })} className="min-h-9 shrink-0 rounded-sm border border-noxia-silver/20 px-2 text-xs text-noxia-ash hover:border-noxia-violet/60 hover:text-white disabled:opacity-60">Oublier</button></li>)}</ul>;
}
