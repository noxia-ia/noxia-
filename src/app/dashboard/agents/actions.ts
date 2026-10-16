"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { moderateGenerationRequest } from "@/lib/safety/moderation";
import { moderationMessage } from "@/lib/safety/policy";
import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { listAgentProviders, type AgentConfig, type AgentImage, type AgentResponse, type ChatMessage } from "@/lib/ai/agents";
import { parseAgentForm, sanitizeReply } from "@/lib/ai/agents/validate";
import { preflight } from "@/lib/providers/pipeline";
import { executeProvider } from "@/lib/providers/execute";
import { logEvent } from "@/lib/providers/log";
import { createConversation, addUserMessage, completeAssistantMessage, failAssistantMessage, setMessageProvider } from "@/lib/agent-chat";
import { generationGateway } from "@/lib/generation-gateway";
import { listAgentMemories } from "@/lib/agent-memory";
import { formatMemoryContext, selectRelevantMemories } from "@/lib/memory-context";
import { UUID_RE } from "@/lib/validation";
import { LIMITS, MAX_AGENTS } from "@/modules/agents/config";
import { chatMessageCreditCost } from "@/lib/generation-costs";
import { enterChatWindow, releaseChatWindow, resolveWindowPlan } from "@/lib/chat-windows";
import { getCurrentSubscription } from "@/lib/subscription";
import { claimForSend, finishAttachments, loadPayload, type AttachmentRow } from "@/lib/attachments/service";
import { processAiGeneratedFiles } from "@/lib/attachments/process-ai-files";
import { parseImageIntent } from "@/lib/chat-image-intent";
import { generateChatImage } from "@/lib/chat-image";
import { ProviderError } from "@/lib/providers/errors";
import type { AgentFormState, AgentInput, ChatActionState } from "@/modules/agents/types";
import type { Agent } from "@/types/database";

const toRow = (d: AgentInput, provider: string | null) => ({ name: d.name, description: d.description, icon: d.icon, objective: d.objective, role: d.role, instructions: d.instructions, domain: d.domain, personality: d.personality, personality_custom: d.personalityCustom, creativity: d.creativity, language: d.language, provider, status: d.status });
const formError = (message: string): AgentFormState => ({ status: "error", message });

// Création / modification : RLS garantit que seul le propriétaire écrit ; user_id vient de la session serveur.
export async function saveAgentAction(_prev: AgentFormState, formData: FormData): Promise<AgentFormState> {
  const gate = await requireAgeVerifiedUser(); // âge vérifié côté serveur : créer / modifier un agent
  if (!gate.ok) return formError(AGE_DENIED_MESSAGE);
  const { supabase, user } = gate;
  const parsed = parseAgentForm(formData, []);
  if (!parsed.ok) return formError(parsed.error);
  const d = parsed.data; // les instructions d'un agent sont aussi modérées (elles pilotent le fournisseur)
  const mod = await moderateGenerationRequest({ module: "agents", prompt: [d.name, d.description, d.objective, d.role, d.instructions, d.domain, d.personalityCustom ?? ""].join("\n") }, user.id);
  if (!mod.allowed) return formError(moderationMessage(mod));
  const id = String(formData.get("id") ?? "");
  let targetId: string;
  if (id) {
    if (!UUID_RE.test(id)) return formError("Agent introuvable.");
    const { data: existing } = await supabase.from("agents").select("id,provider").eq("id", id).eq("user_id", user.id).maybeSingle<{ id: string; provider: string | null }>();
    if (!existing) return formError("Agent introuvable ou modification impossible.");
    const { data, error } = await supabase.from("agents").update(toRow(parsed.data, existing.provider)).eq("id", id).eq("user_id", user.id).select("id").maybeSingle<{ id: string }>();
    if (error || !data) return formError("Agent introuvable ou modification impossible.");
    targetId = data.id;
  } else {
    const { data, error } = await supabase.from("agents").insert({ user_id: user.id, ...toRow(parsed.data, null) }).select("id").single<{ id: string }>();
    if (error || !data) return formError(error?.message.includes("agent_limit_reached") ? `Tu as atteint la limite de ${MAX_AGENTS} agents.` : "Impossible d'enregistrer l'agent. Réessaie.");
    targetId = data.id;
  }
  revalidatePath("/dashboard/agents");
  redirect(`/dashboard/agents/${targetId}`);
}

export async function toggleAgentStatusAction(agentId: string): Promise<void> {
  const gate = await requireAgeVerifiedUser(); // activer un agent exige l'âge vérifié
  if (!gate.ok) return;
  const { supabase, user } = gate;
  if (!UUID_RE.test(agentId)) return;
  const { data } = await supabase.from("agents").select("status").eq("id", agentId).eq("user_id", user.id).maybeSingle<{ status: string }>();
  if (!data) return;
  await supabase.from("agents").update({ status: data.status === "active" ? "inactive" : "active" }).eq("id", agentId).eq("user_id", user.id);
  revalidatePath("/dashboard/agents");
  revalidatePath(`/dashboard/agents/${agentId}`);
}

export async function deleteAgentAction(agentId: string): Promise<void> {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return;
  const { supabase, user } = gate;
  if (UUID_RE.test(agentId)) await supabase.from("agents").delete().eq("id", agentId).eq("user_id", user.id); // conversations supprimées en cascade
  revalidatePath("/dashboard/agents");
  redirect("/dashboard/agents");
}

// Réponse du fournisseur NON FIABLE : statut, texte et taille validés avant enregistrement.
const validateReply = (res: AgentResponse): AgentResponse => {
  if (res.status !== "completed") throw new ProviderError("GENERATION_FAILED", "reported_failed");
  const reply = sanitizeReply(res.reply);
  if (!reply) throw new ProviderError("RESULT_INVALID", "reply");
  return { ...res, reply };
};

// Envoi d'un message. Sans fournisseur : arrêt AVANT toute écriture (aucune fausse réponse, aucun crédit).
// Le navigateur ne fournit que : agentId, conversationId (vérifiée) et le texte. Historique relu en base, jamais fourni par le client.
export async function sendAgentMessageAction(agentId: string, conversationId: string | null, message: string, attachmentIds: string[] = []): Promise<ChatActionState> {
  const err = (m: string, conversationId?: string): ChatActionState => ({ status: "error", message: m, conversationId });
  const gate = await requireAgeVerifiedUser(); // 1) session 2) âge ≥ 15 AVANT tout le reste
  if (!gate.ok) return err(AGE_DENIED_MESSAGE);
  const { supabase, user } = gate;
  if (!UUID_RE.test(agentId) || (conversationId !== null && !UUID_RE.test(conversationId))) return err("Agent introuvable.");
  const text = String(message ?? "").trim();
  if (!text) return err("Écris un message.");
  if (text.length > LIMITS.message) return err(`Ton message est trop long (${LIMITS.message} caractères maximum).`);
  const { data: row } = await supabase.from("agents").select("*").eq("id", agentId).eq("user_id", user.id).maybeSingle<Agent>();
  if (!row) return err("Agent introuvable.");
  if (row.status !== "active") return err("Cet agent est inactif. Active-le pour discuter.");

  // Pièces jointes : vérifiées et chiffrées par le SERVEUR (propriétaire, non utilisées, non expirées). Le prix vient des pièces validées, jamais du navigateur.
  const ids = Array.isArray(attachmentIds) ? attachmentIds.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
  if (Array.isArray(attachmentIds) && ids.length !== attachmentIds.length) return err("Pièce jointe invalide.");
  const claim = await claimForSend(user.id, ids);
  if (!claim.ok) return err(claim.message);
  const attached: AttachmentRow[] = claim.rows;
  const cost = chatMessageCreditCost(attached.map(a => a.kind)); // 0 crédit (texte, soumis au quota de messages) ou 2 crédits (image / PDF / ZIP / RAR), jamais cumulés

  // modération → abonnement → débit de requêtes → fournisseur disponible → crédits (coût fixé par le serveur)
  const pre = await preflight("agents", { supabase, userId: user.id, prompt: text, context: [row.name, row.description, row.objective, row.role, row.instructions, row.domain, row.personality_custom ?? "", ...attached.map(a => a.original_name)].join("\n"), cost: cost, preferredId: row.provider });
  if (!pre.ok) return { status: pre.kind, message: pre.message };

  let convId = conversationId;
  if (convId) {
    const { data: c } = await supabase.from("agent_conversations").select("id").eq("id", convId).eq("agent_id", agentId).eq("user_id", user.id).maybeSingle<{ id: string }>();
    if (!c) return err("Conversation introuvable.");
  } else {
    convId = await createConversation(user.id, agentId, text);
    if (!convId) return err("Impossible de créer la conversation. Réessaie.");
  }
  const { data: past } = await supabase.from("agent_messages").select("role,content").eq("conversation_id", convId).eq("status", "completed").order("seq", { ascending: false }).limit(LIMITS.history);
  const history: ChatMessage[] = (past ?? []).reverse().map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));

  const savedText = attached.length ? `${text}\n\n📎 Pièce(s) jointe(s) : ${attached.map(a => a.original_name).join(", ")}` : text; // le contenu des pièces n'est PAS conservé
  const userMessageId = await addUserMessage(convId, user.id, savedText);
  if (!userMessageId) return err("Impossible d'enregistrer ton message.", convId);
  // Fenêtre de chat glissante (durée selon le plan). Comptée AVANT la réservation de crédits, libérée avec elle si le message n'est pas livré.
  const win = await enterChatWindow(user.id, resolveWindowPlan(await getCurrentSubscription(supabase, user.id)), cost);
  if (!win.ok) return err(win.message, convId);
  const releaseWindow = () => releaseChatWindow(user.id, win.windowId, cost);
  const assistantAdmission = await generationGateway.agent({ conversationId: convId, userId: user.id, provider: "pending", credits: cost });
  if (!assistantAdmission.id) await releaseWindow();
  if (!assistantAdmission.id) return err(assistantAdmission.error === "INSUFFICIENT_CREDITS" ? "Crédits insuffisants. Choisis un abonnement pour continuer." : "Impossible d'enregistrer la réponse. Aucun crédit n'a été débité.", convId);
  const assistantId = assistantAdmission.id;
  logEvent("generation_started", { module: "agents", generationId: assistantId });
  revalidatePath(`/dashboard/agents/${agentId}`);

  // Demande de création d'image dans le chat (« fais-moi une image de … ») : l'image est créée directement (même chaîne que la page Image : crédits, stockage privé),
  // sans passer par le modèle de texte. Échec : message clair, aucun crédit débité, la réservation du message est libérée.
  const imageIntent = attached.length ? null : parseImageIntent(text);
  if (imageIntent) {
    const img = await generateChatImage({ supabase, userId: user.id, intent: imageIntent });
    if (!img.ok) {
      await failAssistantMessage(assistantId, img.message);
      await releaseWindow();
      return err(img.message, convId);
    }
    const imgDone = await completeAssistantMessage(assistantId, img.reply, cost);
    if (!imgDone.ok) {
      await releaseWindow();
      await failAssistantMessage(assistantId, "Erreur d'enregistrement.");
      return err("Erreur d'enregistrement de la réponse.", convId);
    }
    logEvent("generation_completed", { module: "agents", generationId: assistantId, provider: "image" });
    return { status: "success", conversationId: convId };
  }

  const agent: AgentConfig = { name: row.name, description: row.description, objective: row.objective, role: row.role, instructions: row.instructions, domain: row.domain, personality: row.personality, personalityCustom: row.personality_custom, creativity: row.creativity, language: row.language };
  const memories = await listAgentMemories(user.id, agentId, 20);
  const relevantMemories = selectRelevantMemories(memories, text, { maxItems: 8, maxChars: 5000 });
  const memoryContext = formatMemoryContext(relevantMemories);

  // Lecture des pièces jointes (image → modèle de vision ; ZIP → résumé filtré). Un échec ici rembourse la réservation, comme tout échec fournisseur.
  let images: AgentImage[] = [];
  let attachmentContext: string | undefined;
  if (attached.length) {
    const loaded = await loadPayload(attached);
    if (!loaded.ok) {
      await failAssistantMessage(assistantId, loaded.message);
      await releaseWindow();
      await finishAttachments(user.id, attached, userMessageId);
      return err(`${loaded.message} Aucun crédit n'a été débité.`, convId);
    }
    images = loaded.payload.images; attachmentContext = loaded.payload.archiveDigest ?? undefined;
  }
  const run = await executeProvider("agents", (p, signal) => {
    if (images.length && !p.supportsVision) throw new ProviderError("PROVIDER_UNAVAILABLE", "no_vision"); // jamais d'analyse d'image sans modèle de vision
    return p.sendMessage({ agent, conversation: history, message: text, context: { memory: memoryContext }, images, attachmentContext }, { signal });
  }, validateReply, { preferredId: row.provider, generationId: assistantId });
  if (!run.ok) {
    const failMessage = images.length ? "L'analyse d'image est momentanément indisponible." : run.error.message;
    await failAssistantMessage(assistantId, failMessage);
    await releaseWindow();
    await finishAttachments(user.id, attached, userMessageId);
    return err(`${failMessage} Aucun crédit n'a été débité.`, convId);
  }
  await setMessageProvider(assistantId, run.providerId);
  let reply = run.value.status === "completed" ? run.value.reply : "";
  if (reply) { try { reply = await processAiGeneratedFiles(user.id, reply); } catch { /* génération de fichier échouée : on garde la réponse texte */ } }
  const done = await completeAssistantMessage(assistantId, reply, cost); // enregistrement + débit atomiques, une seule fois
  await finishAttachments(user.id, attached, userMessageId); // binaires supprimés, métadonnées conservées
  if (!done.ok) {
    await releaseWindow();
    await failAssistantMessage(assistantId, done.insufficient ? "Crédits insuffisants." : "Erreur d'enregistrement.");
    return err(`${done.insufficient ? "Crédits insuffisants." : "Erreur d'enregistrement."} Aucun crédit n'a été débité.`, convId);
  }
  logEvent("generation_completed", { module: "agents", generationId: assistantId, provider: run.providerId });
  return { status: "success", conversationId: convId };
}
