import "server-only";
import { getProviderChain, type ModuleProviders } from "./registry";
import { ProviderError, RETRY_POLICY, classifyError, normalize, type NormalizedError } from "./errors";
import { logEvent } from "./log";
import type { ProviderModule } from "./types";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Timeout serveur : un fournisseur muet ne bloque jamais une génération.
export async function withTimeout<R>(ms: number, fn: (signal: AbortSignal) => Promise<R>): Promise<R> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { ac.abort(); reject(new ProviderError("PROVIDER_TIMEOUT", "timeout")); }, ms); });
  try { return await Promise.race([fn(ac.signal), timeout]); } finally { if (timer) clearTimeout(timer); }
}

export type ExecResult<R> = { ok: true; value: R; providerId: string; attempts: number } | { ok: false; error: NormalizedError };

// Appelle la chaîne de fournisseurs : timeout, réessais (erreurs temporaires), bascule (fournisseur suivant), validation du résultat.
// Garanties : le premier résultat VALIDE est retourné immédiatement (aucun second fournisseur) ; aucun débit ici (le débit est unique, à la finalisation).
export async function executeProvider<M extends ProviderModule, R, T = R>(
  module: M,
  call: (provider: ModuleProviders[M], signal: AbortSignal) => Promise<R>,
  validate: (raw: R) => T, // lance ProviderError("RESULT_INVALID" | "GENERATION_FAILED") si le résultat n'est pas acceptable
  opts: { preferredId?: string | null; onlyId?: string | null; generationId?: string; admissionKind?: "generation" | "agent" } = {},
): Promise<ExecResult<T>> {
  const chain = getProviderChain(module, opts);
  if (chain.length === 0) return { ok: false, error: normalize(new ProviderError("NO_PROVIDER")) };
  let last: ProviderError | null = null;
  let attempts = 0;
  for (const rp of chain) {
    for (let attempt = 0; attempt <= rp.maxRetries; attempt++) {
      attempts++;
      const started = Date.now();
      logEvent("provider_called", { module, provider: rp.config.id, attempt, generationId: opts.generationId });
      try {
        const value = validate(await withTimeout(rp.timeoutMs, signal => call(rp.provider, signal)));
        return { ok: true, value, providerId: rp.config.id, attempts };
      } catch (e) {
        const err = classifyError(e);
        last = err;
        logEvent(err.code === "PROVIDER_TIMEOUT" ? "generation_timeout" : "provider_failed", { module, provider: rp.config.id, code: err.code, durationMs: Date.now() - started, generationId: opts.generationId });
        const policy = RETRY_POLICY[err.code];
        if (policy.retrySame && attempt < rp.maxRetries) { await sleep(400 * (attempt + 1)); continue; } // erreurs temporaires seulement, nombre borné
        if (!policy.fallback) return { ok: false, error: normalize(err) };                              // contenu refusé, requête invalide… : on s'arrête
        break;                                                                                         // fournisseur suivant
      }
    }
  }
  return { ok: false, error: normalize(last ?? new ProviderError("PROVIDER_UNAVAILABLE")) };
}


