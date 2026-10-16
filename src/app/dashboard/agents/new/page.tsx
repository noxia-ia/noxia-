import { getSessionProfile } from "@/lib/auth";
import { AgentForm } from "@/components/agents/AgentForm";
import { AGENT_TEMPLATES } from "@/modules/agents/templates";

export default async function NewAgentPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  await getSessionProfile();
  const sp = await searchParams;
  const t = AGENT_TEMPLATES.find(x => x.id === sp.template);
  const initial = t ? { name: t.name, icon: t.icon, description: t.description, objective: t.description, role: t.role, instructions: t.instructions, domain: t.domain, personality: t.personality, creativity: t.creativity } : {};
  return (
    <main className="mx-auto max-w-2xl p-5 md:p-10">
      <h1 className="font-display text-3xl text-noxia-silver">Créer un agent</h1>
      <div className="mt-6"><AgentForm initial={initial} providers={[]} /></div>
    </main>
  );
}
