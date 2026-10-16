import "server-only";
import type { AIProvider, GenerateCodeRequest, GenerateCodeResult } from "@/lib/ai/types";
import { ProviderError } from "@/lib/providers/errors";
import { cloudflareHealth, cloudflareRunJson } from "../cloudflare-client";
import { parseCodeOutput } from "./output";
import { CODE_SYSTEM_PROMPT, CODE_MAX_TOKENS } from "./openrouter";

// Fournisseur CODE : Cloudflare Workers AI. Le modèle vient de CLOUDFLARE_MODEL_CODE (« @cf/<organisation>/<modèle> ») : absent → « configuration incomplète ».
// Même consigne et même validation de sortie que le fournisseur OpenRouter (JSON strict ; un JSON coupé est refusé, jamais de résultat partiel).
// Réponse attendue : { response: "<texte>" }. NON testé par un appel réel depuis ce code : à confirmer avec le modèle choisi.
export class CloudflareCode implements AIProvider {
  readonly id = "cloudflare";
  constructor(private readonly apiToken: string, private readonly accountId: string, private readonly model: string) {}
  async generateCode(req: GenerateCodeRequest, opts?: { signal?: AbortSignal }): Promise<GenerateCodeResult> {
    const user = `Type de projet : ${req.projectType}\nTechnologie : ${req.technology}\n\nDemande de l'utilisateur :\n${req.prompt}`;
    const result = await cloudflareRunJson(this.apiToken, this.accountId, this.model,
      { messages: [{ role: "system", content: CODE_SYSTEM_PROMPT }, { role: "user", content: user }], temperature: 0.2, max_tokens: CODE_MAX_TOKENS }, opts?.signal);
    const text = (result as { response?: unknown } | null)?.response;
    if (typeof text !== "string" || !text.trim()) throw new ProviderError("RESULT_INVALID", "cf_code_empty");
    return parseCodeOutput(text);
  }
  healthCheck(opts?: { signal?: AbortSignal }) { return cloudflareHealth(this.apiToken, opts?.signal); }
}
