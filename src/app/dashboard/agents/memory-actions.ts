"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { UUID_RE } from "@/lib/validation";
import { saveAgentMemory, deleteAgentMemory } from "@/lib/agent-memory";

export async function rememberMessageAction(agentId: string, conversationId: string | null, content: string) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok || !UUID_RE.test(agentId) || (conversationId !== null && !UUID_RE.test(conversationId))) return { ok: false };
  const { supabase, user } = gate;
  const { data: agent } = await supabase.from("agents").select("id").eq("id", agentId).eq("user_id", user.id).maybeSingle();
  if (!agent) return { ok: false };
  if (conversationId) {
    const { data: conversation } = await supabase.from("agent_conversations").select("id").eq("id", conversationId).eq("agent_id", agentId).eq("user_id", user.id).maybeSingle();
    if (!conversation) return { ok: false };
  }
  const memory = await saveAgentMemory(user.id, agentId, conversationId, content);
  if (!memory) return { ok: false };
  revalidatePath(`/dashboard/agents/${agentId}`);
  return { ok: true, memoryId: memory.id };
}

export async function forgetMemoryAction(agentId: string, memoryId: string) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok || !UUID_RE.test(agentId) || !UUID_RE.test(memoryId)) return { ok: false };
  const { supabase, user } = gate;
  const { data: agent } = await supabase.from("agents").select("id").eq("id", agentId).eq("user_id", user.id).maybeSingle();
  if (!agent) return { ok: false };
  await deleteAgentMemory(user.id, memoryId);
  revalidatePath(`/dashboard/agents/${agentId}`);
  return { ok: true };
}
