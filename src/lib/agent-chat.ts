import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidChatMessageCost } from "@/lib/generation-costs";

// Seules fonctions autorisées à écrire conversations/messages. Appelées depuis une Server Action
// APRÈS vérification de la session et de la propriété de l'agent : les ids viennent du serveur.
export async function createConversation(userId: string, agentId: string, firstMessage: string) {
  const { data, error } = await createAdminClient().from("agent_conversations")
    .insert({ user_id: userId, agent_id: agentId, title: firstMessage.slice(0, 100), last_message: firstMessage.slice(0, 120) })
    .select("id").single<{ id: string }>();
  return error || !data ? null : data.id;
}
export async function addUserMessage(conversationId: string, userId: string, content: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("agent_messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", content, status: "completed" }).select("id").single<{ id: string }>();
  if (error || !data) return null;
  await db.from("agent_conversations").update({ last_message: content.slice(0, 120), last_message_at: new Date().toISOString() }).eq("id", conversationId);
  return data.id;
}
export type AgentAdmission = { id: string | null; error?: "INSUFFICIENT_CREDITS" | "ERROR" };
export async function addPendingAssistant(conversationId: string, userId: string, provider: string, credits: number): Promise<AgentAdmission> {
  if (!isValidChatMessageCost(credits)) return { id: null, error: "ERROR" };
  try {
    const { data, error } = await createAdminClient().rpc("create_pending_agent_message_atomic", { p_conversation_id: conversationId, p_user_id: userId, p_provider: provider, p_credits: credits });
    if (!error && typeof data === "string") return { id: data };
    return { id: null, error: String(error?.message ?? "").includes("insufficient_credits") ? "INSUFFICIENT_CREDITS" : "ERROR" };
  } catch { return { id: null, error: "ERROR" }; }
}
// Enregistre la réponse VALIDÉE et débite atomiquement (fonction SQL réservée au serveur).
export async function completeAssistantMessage(id: string, content: string, credits: number): Promise<{ ok: true } | { ok: false; insufficient: boolean }> {
  if (!isValidChatMessageCost(credits)) return { ok: false, insufficient: false };
  const { error } = await createAdminClient().rpc("finalize_agent_message", { p_message_id: id, p_status: "completed", p_content: content, p_credits: credits });
  return error ? { ok: false, insufficient: error.message.includes("insufficient_credits") } : { ok: true };
}
export async function failAssistantMessage(id: string, message: string) {
  await createAdminClient().rpc("finalize_agent_message", { p_message_id: id, p_status: "failed", p_error: message });
}
// Enregistre le fournisseur réellement utilisé (peut différer du premier choix en cas de bascule).
export async function setMessageProvider(id: string, providerId: string) {
  await createAdminClient().from("agent_messages").update({ provider: providerId }).eq("id", id).eq("status", "pending");
}
