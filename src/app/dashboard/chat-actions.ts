"use server";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { UUID_RE } from "@/lib/validation";
import { AGENT_TEMPLATES } from "@/modules/agents/templates";
import { sendAgentMessageAction } from "@/app/dashboard/agents/actions";
import type { ChatActionState } from "@/modules/agents/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Le compagnon par défaut de l'accueil : un agent « NOXIA » créé une seule fois pour chaque compte (modèle « noxia-companion »).
const DEFAULT_AGENT_NAME = "NOXIA";

async function ensureNoxiaAgent(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data: found } = await supabase.from("agents").select("id,status").eq("user_id", userId).eq("name", DEFAULT_AGENT_NAME)
    .order("created_at", { ascending: true }).limit(1).maybeSingle<{ id: string; status: string }>();
  if (found) {
    if (found.status !== "active") await supabase.from("agents").update({ status: "active" }).eq("id", found.id).eq("user_id", userId);
    return found.id;
  }
  const t = AGENT_TEMPLATES.find(x => x.id === "noxia-companion");
  if (!t) return null;
  const { data, error } = await supabase.from("agents").insert({
    user_id: userId, name: DEFAULT_AGENT_NAME, description: t.description, icon: t.icon, objective: "", role: t.role, instructions: t.instructions,
    domain: t.domain, personality: t.personality, personality_custom: null, creativity: t.creativity, language: "fr", provider: null, status: "active",
  }).select("id").single<{ id: string }>();
  return error || !data ? null : data.id;
}

// Envoi depuis l'accueil. Conversation existante → on reste avec son agent. Sinon → agent NOXIA par défaut.
// Toute la sécurité (âge, modération, crédits, abonnement) est celle de sendAgentMessageAction : rien n'est contourné.
export async function sendHomeMessageAction(conversationId: string | null, message: string, attachmentIds: string[] = []): Promise<ChatActionState> {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return { status: "error", message: AGE_DENIED_MESSAGE };
  const { supabase, user } = gate;
  if (conversationId !== null && !UUID_RE.test(conversationId)) return { status: "error", message: "Conversation introuvable." };
  let agentId: string | null = null;
  if (conversationId) {
    const { data } = await supabase.from("agent_conversations").select("agent_id").eq("id", conversationId).eq("user_id", user.id).maybeSingle<{ agent_id: string }>();
    agentId = data?.agent_id ?? null;
    if (!agentId) return { status: "error", message: "Conversation introuvable." };
  } else {
    agentId = await ensureNoxiaAgent(supabase, user.id);
    if (!agentId) return { status: "error", message: "Impossible de démarrer la discussion. Réessaie." };
  }
  return sendAgentMessageAction(agentId, conversationId, message, attachmentIds);
}
