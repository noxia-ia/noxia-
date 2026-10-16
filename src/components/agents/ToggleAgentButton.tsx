"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAgentStatusAction } from "@/app/dashboard/agents/actions";
import type { AgentStatus } from "@/types/database";
export function ToggleAgentButton({ id, status }: { id: string; status: AgentStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(async () => { await toggleAgentStatusAction(id); router.refresh(); })}
      className="min-h-11 rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white disabled:opacity-60">{status === "active" ? "Désactiver" : "Activer"}</button>
  );
}
