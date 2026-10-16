import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { UUID_RE } from "@/lib/validation";
import { AgentForm } from "@/components/agents/AgentForm";
import type { Agent } from "@/types/database";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getSessionProfile();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { data: a } = await supabase.from("agents").select("*").eq("id", id).eq("user_id", user.id).maybeSingle<Agent>();
  if (!a) notFound();
  const initial = { id: a.id, name: a.name, icon: a.icon, objective: a.objective, description: a.description, role: a.role, instructions: a.instructions, domain: a.domain, personality: a.personality, personalityCustom: a.personality_custom ?? "", creativity: a.creativity, language: a.language, status: a.status };
  return (
    <main className="mx-auto max-w-2xl p-5 md:p-10">
      <h1 className="font-display text-3xl text-noxia-silver">Modifier l'agent</h1>
      <div className="mt-6"><AgentForm initial={initial} providers={[]} /></div>
    </main>
  );
}
