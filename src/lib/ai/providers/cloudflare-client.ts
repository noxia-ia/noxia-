import "server-only";
import { providerFetchJson } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/errors";

// Client Workers AI partagé (texte, voix, image). Jeton lu côté serveur (CLOUDFLARE_API_TOKEN), identifiant de compte (CLOUDFLARE_ACCOUNT_ID) : jamais NEXT_PUBLIC_.
// Les statuts HTTP sont normalisés par providerFetchJson (corps d'erreur jamais lu, clé jamais journalisée).
const ACCOUNT_RE = /^[a-f0-9]{32}$/i;
const MODEL_RE = /^@cf\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
export const cloudflareAccountId = (): string => process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";

export function cloudflareRunUrl(accountId: string, model: string): string {
  if (!ACCOUNT_RE.test(accountId)) throw new ProviderError("PROVIDER_MISCONFIGURED", "cf_account_id");
  if (!MODEL_RE.test(model)) throw new ProviderError("PROVIDER_MISCONFIGURED", "cf_model");
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

export async function cloudflareRunJson(token: string, accountId: string, model: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const raw = await providerFetchJson(cloudflareRunUrl(accountId, model), { method: "POST", signal, headers: { Authorization: `Bearer ${token}` }, body });
  const r = raw as { success?: unknown; result?: unknown } | null;
  if (!r || typeof r !== "object") throw new ProviderError("RESULT_INVALID", "cf_shape");
  if (r.success === false) throw new ProviderError("PROVIDER_UNAVAILABLE", "cf_error_in_body"); // erreur renvoyée avec un statut 200
  return r.result;
}

// Test de santé SANS génération : vérifie seulement que le jeton est valide (GET /user/tokens/verify). Aucun crédit, aucune donnée renvoyée.
export async function cloudflareHealth(token: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
  const r = await providerFetchJson("https://api.cloudflare.com/client/v4/user/tokens/verify", { method: "GET", signal, headers: { Authorization: `Bearer ${token}` } });
  return { ok: !!r && typeof r === "object" && (r as { success?: unknown }).success === true };
}
