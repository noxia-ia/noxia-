import "server-only";
import { ProviderError, fromHttpStatus } from "./errors";

// Aide RÉSERVÉE aux implémentations de fournisseurs (src/lib/ai/providers/<module>/…). Les modules et composants ne l'appellent jamais :
// ils passent par le registre + l'exécuteur. Garanties : HTTPS seulement, signal d'annulation respecté, taille de réponse bornée,
// statut HTTP → erreur normalisée (le corps de l'erreur n'est jamais remonté), clé jamais journalisée.
const MAX_JSON_BYTES = 5_000_000;

export async function providerFetchJson(url: string, init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal }): Promise<unknown> {
  let u: URL;
  try { u = new URL(url); } catch { throw new ProviderError("PROVIDER_MISCONFIGURED", "bad_url"); }
  if (u.protocol !== "https:") throw new ProviderError("PROVIDER_MISCONFIGURED", "not_https");
  const res = await fetch(u, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal, redirect: "error", cache: "no-store",
  });
  if (!res.ok) throw fromHttpStatus(res.status);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_JSON_BYTES) throw new ProviderError("RESULT_INVALID", "too_large");
  const text = await res.text();
  if (text.length > MAX_JSON_BYTES) throw new ProviderError("RESULT_INVALID", "too_large");
  try { return JSON.parse(text) as unknown; } catch { throw new ProviderError("RESULT_INVALID", "not_json"); }
}

// Variante BINAIRE (image) : mêmes garanties que providerFetchJson (HTTPS, annulation, statut → erreur normalisée, corps d'erreur jamais lu, pas de redirection),
// plus : taille bornée AVANT et PENDANT la lecture en flux (jamais plus de `maxBytes` en mémoire). Le contenu n'est PAS interprété ici :
// l'appelant doit valider les octets (src/lib/ai/image/bytes.ts) avant tout stockage.
export async function providerFetchBytes(
  url: string,
  init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal; accept: string },
  opts: { maxBytes: number },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let u: URL;
  try { u = new URL(url); } catch { throw new ProviderError("PROVIDER_MISCONFIGURED", "bad_url"); }
  if (u.protocol !== "https:") throw new ProviderError("PROVIDER_MISCONFIGURED", "not_https");
  const res = await fetch(u, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { Accept: init.accept, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal, redirect: "error", cache: "no-store",
  });
  if (!res.ok) throw fromHttpStatus(res.status);
  if (Number(res.headers.get("content-length") ?? 0) > opts.maxBytes) throw new ProviderError("RESULT_INVALID", "too_large");
  if (!res.body) throw new ProviderError("RESULT_INVALID", "no_body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > opts.maxBytes) { await reader.cancel().catch(() => undefined); throw new ProviderError("RESULT_INVALID", "too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
  return { bytes, contentType: res.headers.get("content-type") ?? "" };
}
