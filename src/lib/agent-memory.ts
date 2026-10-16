import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AgentMemory { id: string; content: string; created_at: string; }

export async function listAgentMemories(userId: string, agentId: string, limit = 20): Promise<AgentMemory[]> {
  const { data } = await createAdminClient().from("agent_memories")
    .select("id,content,created_at").eq("user_id", userId).eq("agent_id", agentId)
    .order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 50));
  return (data ?? []) as AgentMemory[];
}

export async function saveAgentMemory(userId: string, agentId: string, conversationId: string | null, content: string) {
  const text = content.trim().slice(0, 1000);
  if (!text) return null;
  const { data, error } = await createAdminClient().from("agent_memories")
    .insert({ user_id: userId, agent_id: agentId, conversation_id: conversationId, content: text })
    .select("id,content,created_at").maybeSingle<AgentMemory>();
  if (error?.code === "23505") {
    const { data: existing } = await createAdminClient().from("agent_memories")
      .select("id,content,created_at").eq("user_id", userId).eq("agent_id", agentId).ilike("content", text).maybeSingle<AgentMemory>();
    return existing ?? null;
  }
  return error ? null : data;
}

export async function deleteAgentMemory(userId: string, memoryId: string) {
  await createAdminClient().from("agent_memories").delete().eq("id", memoryId).eq("user_id", userId);
}
