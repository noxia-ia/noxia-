"use client";
import { useTransition } from "react";
import { deleteAgentAction } from "@/app/dashboard/agents/actions";
export function DeleteAgentButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => { if (window.confirm("Supprimer cet agent ? Cette action est définitive.")) start(async () => { await deleteAgentAction(id); }); }}
      className="min-h-11 rounded-sm border border-noxia-violet/50 px-4 text-sm text-noxia-violet hover:bg-noxia-violet/10 disabled:opacity-60">{pending ? "Suppression…" : "Supprimer"}</button>
  );
}
