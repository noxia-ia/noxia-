import "server-only";
import { providerFetchJson } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/errors";

// Client OpenRouter partagé par les fournisseurs CODE et AGENTS (API « chat completions » compatible OpenAI).
// Endpoint unique, HTTPS, authentification par en-tête Bearer construit ICI, côté serveur. La clé n'est ni journalisée ni renvoyée.
// Les statuts HTTP sont normalisés par providerFetchJson (401/402/403 → configuration, 429 → limite, 5xx → indisponible) ; le corps d'erreur n'est jamais lu.
const BASE = "https://openrouter.ai/api/v1";
export interface ChatMsg { role: "system" | "user" | "assistant"; content: string }
const MAX_REPLY_CHARS = 400_000;

export async function chatCompletion(apiKey: string, model: string, messages: ChatMsg[], o: { signal?: AbortSignal; temperature: number; maxTokens: number }): Promise<{ text: string; truncated: boolean }> {
  const raw = await providerFetchJson(`${BASE}/chat/completions`, {
    method: "POST", signal: o.signal, headers: { Authorization: `Bearer ${apiKey}` },
    body: { model, messages, temperature: o.temperature, max_tokens: o.maxTokens, stream: false },
  });
  const r = raw as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[]; error?: unknown } | null;
  if (!r || typeof r !== "object") throw new ProviderError("RESULT_INVALID", "or_shape");
  if (r.error) throw new ProviderError("PROVIDER_UNAVAILABLE", "or_error_in_body"); // erreur renvoyée avec un statut 200 : traitée comme panne du fournisseur
  const c = r.choices?.[0];
  const text = c?.message?.content;
  if (typeof text !== "string" || !text.trim() || text.length > MAX_REPLY_CHARS) throw new ProviderError("RESULT_INVALID", "or_empty_or_huge");
  return { text, truncated: c?.finish_reason === "length" };
}

// Test de santé SANS génération et SANS crédit : lecture des informations de la clé (GET /key). Seul le succès est retenu, aucune donnée n'est renvoyée.
export async function openRouterHealth(apiKey: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
  const r = await providerFetchJson(`${BASE}/key`, { method: "GET", signal, headers: { Authorization: `Bearer ${apiKey}` } });
  return { ok: !!r && typeof r === "object" && "data" in (r as object) };
}
