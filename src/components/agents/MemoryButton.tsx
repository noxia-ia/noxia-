"use client";

import { useState, useTransition } from "react";
import { rememberMessageAction } from "@/app/dashboard/agents/memory-actions";

export function MemoryButton({ agentId, conversationId, content }: { agentId: string; conversationId: string; content: string }) {
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending || saved} onClick={() => start(async () => {
      const result = await rememberMessageAction(agentId, conversationId, content);
      if (result.ok) setSaved(true);
    })} className="mt-1 min-h-9 rounded-sm border border-noxia-silver/20 px-2 text-[11px] text-noxia-ash hover:border-noxia-violet/60 hover:text-white disabled:opacity-60" aria-label="Mémoriser ce message">
      {saved ? "✓ Mémorisé" : pending ? "Mémorisation…" : "✦ Mémoriser"}
    </button>
  );
}
