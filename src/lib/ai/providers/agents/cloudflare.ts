import "server-only";
import type { AgentProvider, AgentRequest, AgentResponse } from "@/lib/ai/agents/types";
import { ProviderError } from "@/lib/providers/errors";
import { cloudflareHealth, cloudflareRunJson } from "../cloudflare-client";
import { buildAgentMessages, MAX_TOKENS, TEMPERATURE } from "./shared";

// Fournisseur AGENTS : Cloudflare Workers AI (texte). Le modèle vient de CLOUDFLARE_MODEL_AGENT (« @cf/<organisation>/<modèle> ») : absent → « configuration incomplète ».
// Réponse attendue : { result: { response: "<texte>" } }. NON testé par un appel réel depuis ce code (banc de test avec faux fetch uniquement).
const MAX_REPLY_CHARS = 400_000;
// Analyse d'images : modèle de vision séparé, fourni par CLOUDFLARE_MODEL_VISION (« @cf/… »). Absent → `supportsVision` est faux et AUCUNE image n'est envoyée à ce fournisseur.
// Les images partent dans le message utilisateur au format { type: "image_url", image_url: { url: "data:<type>;base64,…" } } (forme OpenAI-compatible rapportée pour les
// modèles de vision Workers AI ; À CONFIRMER par un vrai appel avec le modèle choisi).
const visionModel = () => process.env.CLOUDFLARE_MODEL_VISION?.trim() ?? "";
export class CloudflareAgent implements AgentProvider {
  readonly id = "cloudflare";
  constructor(private readonly apiToken: string, private readonly accountId: string, private readonly model: string) {}
  get supportsVision(): boolean { return !!visionModel(); }
  async sendMessage(req: AgentRequest, opts?: { signal?: AbortSignal }): Promise<AgentResponse> {
    const messages: { role: string; content: unknown }[] = buildAgentMessages(req);
    let model = this.model;
    if (req.images?.length) {
      if (!this.supportsVision) throw new ProviderError("PROVIDER_UNAVAILABLE", "cf_no_vision_model"); // jamais d'« analyse » sans modèle de vision
      model = visionModel();
      const last = messages[messages.length - 1];
      last.content = [{ type: "text", text: String(last.content) }, ...req.images.map(i => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.base64}` } }))];
    }
    const result = await cloudflareRunJson(this.apiToken, this.accountId, model,
      { messages, temperature: TEMPERATURE[req.agent.creativity], max_tokens: MAX_TOKENS }, opts?.signal);
    const text = (result as { response?: unknown } | null)?.response;
    if (typeof text !== "string" || !text.trim() || text.length > MAX_REPLY_CHARS) throw new ProviderError("RESULT_INVALID", "cf_empty_or_huge");
    return { status: "completed", reply: text.trim() };
  }
  healthCheck(opts?: { signal?: AbortSignal }) { return cloudflareHealth(this.apiToken, opts?.signal); }
}
