import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { getAgentProvider } from "@/lib/ai/agents";
import { UUID_RE } from "@/lib/validation";
import { SensitiveContentNotice } from "@/components/ui/SensitiveContentNotice";
import { ChatPanel } from "@/components/agents/ChatPanel";
import { MemoryList } from "@/components/agents/MemoryList";
import { listAgentMemories } from "@/lib/agent-memory";
import { ConversationList } from "@/components/agents/ConversationList";
import { DeleteAgentButton } from "@/components/agents/DeleteAgentButton";
import { ToggleAgentButton } from "@/components/agents/ToggleAgentButton";
import { PERSONALITY_LABELS, CREATIVITY_LABELS, LANGUAGE_LABELS, AGENT_STATUS_LABELS } from "@/modules/agents/options";
import type { ChatMessageView } from "@/modules/agents/types";
import type { Agent, AgentConversation } from "@/types/database";

export default async function AgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const { supabase, user } = await getSessionProfile();
  const { id } = await params;
  const { c } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const { data: a } = await supabase.from("agents").select("*").eq("id", id).eq("user_id", user.id).maybeSingle<Agent>(); // RLS + filtre explicite
  if (!a) notFound();

  const { data: convs } = await supabase.from("agent_conversations").select("*").eq("agent_id", id).eq("user_id", user.id).order("last_message_at", { ascending: false }).limit(20).returns<AgentConversation[]>();
  const conversations = convs ?? [];
  const memories = await listAgentMemories(user.id, id, 20);
  const current = c && UUID_RE.test(c) ? conversations.find(x => x.id === c) ?? null : null;
  let messages: ChatMessageView[] = [];
  if (current) {
    const { data } = await supabase.from("agent_messages").select("id,role,content,status,error_message").eq("conversation_id", current.id).eq("user_id", user.id).order("seq", { ascending: true }).limit(200);
    messages = (data ?? []).map(m => ({ id: m.id, role: m.role === "assistant" ? "assistant" : "user", content: m.content, status: m.status, error: m.error_message ?? null }));
  }
  const rows: [string, string][] = [["Rôle", a.role], ["Objectif", a.objective || "—"], ["Domaine", a.domain || "—"], ["Personnalité", PERSONALITY_LABELS[a.personality] + (a.personality_custom ? ` · ${a.personality_custom}` : "")], ["Langue", LANGUAGE_LABELS[a.language]], ["Créativité", CREATIVITY_LABELS[a.creativity]], ["Statut", AGENT_STATUS_LABELS[a.status]], ["Créé le", new Date(a.created_at).toLocaleDateString("fr-FR")], ["Modifié le", new Date(a.updated_at).toLocaleDateString("fr-FR")]];
  return (
    <main className="mx-auto max-w-3xl p-5 md:p-10">
      <Link href="/dashboard/agents" className="inline-flex min-h-11 items-center text-sm text-noxia-ash hover:text-white">← Mes agents</Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="grid h-14 w-14 flex-none place-items-center rounded-full border border-noxia-silver/20 bg-noxia-night text-3xl" aria-hidden>{a.icon}</span>
        <div className="min-w-0"><h1 className="break-words font-display text-2xl text-noxia-silver">{a.name}</h1>{a.description && <p className="break-words text-sm text-noxia-ash">{a.description}</p>}</div>
      </div>
      <details className="mt-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-4">
        <summary className="min-h-8 cursor-pointer text-sm text-noxia-silver">Détails de l'agent</summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-noxia-ash">{k}</dt><dd className="break-words text-noxia-silver">{v}</dd></div>)}</dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/dashboard/agents/${a.id}/edit`} className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Modifier</Link>
          <ToggleAgentButton id={a.id} status={a.status} />
          <DeleteAgentButton id={a.id} />
        </div>
      </details>

      <details className="mt-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-4" open={conversations.length > 0 && !current}>
        <summary className="min-h-8 cursor-pointer text-sm text-noxia-silver">Conversations ({conversations.length})</summary>
        <div className="mt-3 space-y-3">
          <Link href={`/dashboard/agents/${a.id}`} className="inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">+ Nouvelle conversation</Link>
          <ConversationList items={conversations} activeId={current?.id} empty="Vous n'avez encore aucune conversation avec cet agent." />
        </div>
      </details>

      <details className="mt-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-4">
        <summary className="min-h-8 cursor-pointer text-sm text-noxia-silver">Mémoire de NOXIA ({memories.length})</summary>
        <div className="mt-3"><MemoryList agentId={a.id} items={memories} /></div>
      </details>

      <div className="mt-6"><SensitiveContentNotice /></div>
      <h2 className="mt-8 font-display text-xl text-noxia-silver">{current ? "Conversation" : "Nouvelle conversation"}</h2>
      <div className="mt-3"><ChatPanel key={current?.id ?? "new"} agentId={a.id} conversationId={current?.id ?? null} messages={messages} engineReady={getAgentProvider(a.provider) !== null} active={a.status === "active"} /></div>
    </main>
  );
}
