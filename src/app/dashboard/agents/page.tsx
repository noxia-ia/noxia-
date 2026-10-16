import { getSessionProfile } from "@/lib/auth";
import { ContentNotice } from "@/components/safety/ContentNotice";
import { getAgentProvider } from "@/lib/ai/agents";
import { AgentCard } from "@/components/agents/AgentCard";
import { ConversationList, type ConversationItem } from "@/components/agents/ConversationList";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { AGENT_TEMPLATES } from "@/modules/agents/templates";
import { NOT_CONFIGURED_MESSAGE } from "@/modules/agents/config";
import type { Agent, AgentConversation } from "@/types/database";

export default async function AgentsPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const [{ data, error }, { data: convs }] = await Promise.all([
    supabase.from("agents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<Agent[]>(),
    supabase.from("agent_conversations").select("*").eq("user_id", user.id).order("last_message_at", { ascending: false }).limit(8).returns<AgentConversation[]>(),
  ]);
  const agents = data ?? [];
  const byId = new Map(agents.map(a => [a.id, a]));
  const recent: ConversationItem[] = (convs ?? []).map(c => ({ ...c, agentName: byId.get(c.agent_id)?.name, agentIcon: byId.get(c.agent_id)?.icon }));
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-10">
      <h1 className="font-display text-3xl tracking-widest text-noxia-silver">NOXIA AGENTS</h1>
      <p className="mt-2 text-noxia-ash">Crée tes propres agents IA spécialisés : rôle, instructions, personnalité et langue, puis discute avec eux.</p>
      <p className="mt-4 inline-block rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Crédits disponibles : {profile?.credits ?? 0}</p>
      {!getAgentProvider() && <p role="status" className="mt-4 rounded-sm border border-amber-500/40 p-3 text-sm text-amber-400">{NOT_CONFIGURED_MESSAGE}</p>}
      <ContentNotice />
      <div className="mt-6"><Button href="/dashboard/agents/new">Créer un agent</Button></div>

      <h2 className="mt-10 font-display text-xl text-noxia-silver">Mes agents</h2>
      {error && <p className="mt-3 text-sm text-noxia-ash">Liste indisponible pour le moment.</p>}
      {!error && agents.length === 0 && <p className="mt-3 text-sm text-noxia-ash">Vous n'avez encore aucun agent.</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{agents.map(a => <AgentCard key={a.id} a={a} />)}</div>

      <h2 className="mt-10 font-display text-xl text-noxia-silver">Conversations récentes</h2>
      <div className="mt-3"><ConversationList items={recent} empty="Vous n'avez encore aucune conversation." /></div>

      <h2 className="mt-10 font-display text-xl text-noxia-silver">Modèles de départ</h2>
      <p className="mt-1 text-sm text-noxia-ash">Des points de départ pour pré-remplir un agent. Ce ne sont pas des agents IA fonctionnels.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENT_TEMPLATES.map(t => (
          <Link key={t.id} href={`/dashboard/agents/new?template=${t.id}`} className="block rounded-md border border-noxia-silver/15 bg-noxia-night p-4 hover:border-noxia-violet/60">
            <p className="text-noxia-silver">{t.icon} {t.name}</p><p className="mt-1 text-sm text-noxia-ash">{t.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
