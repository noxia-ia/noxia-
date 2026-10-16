import "server-only";
import type { AgentProvider, AgentRequest, AgentResponse } from "@/lib/ai/agents/types";
import { chatCompletion, openRouterHealth } from "../openrouter-client";
import { buildAgentMessages, MAX_TOKENS, TEMPERATURE } from "./shared";

// Fournisseur AGENTS via OpenRouter. Reçoit la configuration de l'agent, l'historique (lu en base par le serveur) et le nouveau message.
export class OpenRouterAgent implements AgentProvider {
  readonly id = "openrouter";
  constructor(private readonly apiKey: string, private readonly model: string) {}
  async sendMessage(req: AgentRequest, opts?: { signal?: AbortSignal }): Promise<AgentResponse> {
    const { text } = await chatCompletion(this.apiKey, this.model, buildAgentMessages(req), { signal: opts?.signal, temperature: TEMPERATURE[req.agent.creativity], maxTokens: MAX_TOKENS });
    return { status: "completed", reply: text.trim() };
  }
  healthCheck(opts?: { signal?: AbortSignal }) { return openRouterHealth(this.apiKey, opts?.signal); }
}
