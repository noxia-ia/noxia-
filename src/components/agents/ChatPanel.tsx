"use client";
import { MessageContent } from "@/components/chat/MessageContent";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendAgentMessageAction } from "@/app/dashboard/agents/actions";
import { AGENT_NOT_CONFIGURED_MESSAGE } from "@/modules/agents/config";
import type { ChatMessageView } from "@/modules/agents/types";
import { NoxiaVoiceControls } from "@/components/voice/NoxiaVoiceControls";
import { MemoryButton } from "@/components/agents/MemoryButton";

// L'affichage vient UNIQUEMENT de la base (props). Aucune réponse n'est jamais fabriquée côté client.
export function ChatPanel({ agentId, conversationId, messages, engineReady, active }: { agentId: string; conversationId: string | null; messages: ChatMessageView[]; engineReady: boolean; active: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(engineReady ? null : { kind: "info", text: AGENT_NOT_CONFIGURED_MESSAGE });
  const [pending, start] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages.length, pending]);

  const latestAssistant = [...messages].reverse().find(m => m.role === "assistant" && m.status === "completed")?.content ?? "";

  function send(forcedText?: string) {
    const text = (forcedText ?? input).trim();
    if (!text || pending) return;
    start(async () => {
      setPendingText(text);
      const r = await sendAgentMessageAction(agentId, conversationId, text);
      if (r.status === "success") { setInput(""); setNotice(null); }
      else setNotice({ kind: r.status === "not_configured" ? "info" : "error", text: r.message });
      setPendingText(null);
      if (r.conversationId) {
        if (r.conversationId !== conversationId) router.replace(`/dashboard/agents/${agentId}?c=${r.conversationId}`);
        router.refresh();
      }
    });
  }
  return (
    <div className="space-y-3">
      <div ref={logRef} role="log" aria-live="polite" className="max-h-[55vh] min-h-40 space-y-3 overflow-y-auto rounded-sm border border-noxia-silver/15 bg-noxia-night p-3">
        {messages.length === 0 && !pending && <p className="text-sm text-noxia-ash">Aucun message pour le moment.</p>}
        {messages.map(m => (
          <div key={m.id} className={`max-w-[90%] ${m.role === "user" ? "ml-auto" : ""}`}>
            <div className={`whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm ${m.role === "user" ? "bg-noxia-violet/25 text-white" : m.status === "failed" ? "border border-noxia-violet/50 text-noxia-violet" : "bg-noxia-night text-noxia-silver"}`}>
              {m.status === "pending" ? "Réponse en cours…" : m.status === "failed" ? `Échec : ${m.error ?? "l'agent n'a pas répondu."} Aucun crédit n'a été débité.` : <MessageContent text={m.content} />}
            </div>
            {m.role === "user" && m.status === "completed" && conversationId && <MemoryButton agentId={agentId} conversationId={conversationId} content={m.content} />}
          </div>
        ))}
        {pending && pendingText && <div className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-md bg-noxia-violet/15 px-3 py-2 text-sm text-white/80">{pendingText}</div>}
        {pending && <p className="text-sm text-noxia-ash">L'agent réfléchit…</p>}
      </div>
      {!active && <p role="status" className="text-sm text-amber-400">Cet agent est inactif. Active-le pour discuter.</p>}
      {notice && <p role={notice.kind === "error" ? "alert" : "status"} className={`text-sm ${notice.kind === "error" ? "text-noxia-violet" : "text-amber-400"}`}>{notice.text}</p>}
      <NoxiaVoiceControls text={latestAssistant} onTranscript={setInput} onVoiceSubmit={(value) => send(value)} thinking={pending} disabled={!active || pending} />
      <textarea value={input} onChange={e => setInput(e.target.value)} rows={3} maxLength={4000} placeholder="Écris ton message…" aria-label="Message" disabled={!active}
        className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet disabled:opacity-60" />
      <button onClick={() => send()} disabled={pending || !active || !input.trim()} className="min-h-12 w-full rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60 sm:w-auto">{pending ? "Envoi…" : "Envoyer"}</button>
    </div>
  );
}
