import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moderateGenerationRequest } from "@/lib/safety/moderation";
import { moderationMessage } from "@/lib/safety/policy";
import { hasEnoughCredits } from "@/lib/credits";
import { getCurrentSubscription } from "@/lib/subscription";
import { setProcessing, completeGeneration, failGeneration } from "@/lib/generations";
import { getProviderChain } from "./registry";
import { ProviderError, USER_MESSAGES, type ErrorCode } from "./errors";
import { RATE_LIMITS_PER_MINUTE } from "./config";
import { logEvent } from "./log";
import type { ProviderModule } from "./types";

export type PreflightResult = { ok: true } | { ok: false; code: ErrorCode; message: string; kind: "error" | "not_configured" | "insufficient_credits" };
const deny = (code: ErrorCode, message: string = USER_MESSAGES[code]): PreflightResult =>
  ({ ok: false, code, message, kind: code === "NO_PROVIDER" ? "not_configured" : code === "INSUFFICIENT_CREDITS" ? "insufficient_credits" : "error" });

// Limitation de débit côté serveur (comptage en base, lecture de SES PROPRES lignes). Ouvert en cas d'erreur de lecture.
async function hasInFlightGeneration(supabase: SupabaseClient, userId: string, module: ProviderModule): Promise<boolean> {
  // Une seule génération « en cours d'appel » à la fois (fenêtre 10 min > plus long timeout).
  // Le débit de requêtes lui-même est réservé atomiquement par consume_generation_rate_slot().
  const recent = new Date(Date.now() - 600_000).toISOString();
  const p = module === "agents"
    ? supabase.from("agent_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "assistant").eq("status", "pending").gte("created_at", recent)
    : supabase.from("generations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("module", module).eq("status", "pending").gte("created_at", recent);
  const { count } = await p;
  return (count ?? 0) >= 1;
}

// Suite du pipeline APRÈS : authentification, âge (requireAgeVerifiedUser) et validation de la demande.
// Ordre : MODÉRATION → AUTORISATION DU MODULE → LIMITE DE DÉBIT → FOURNISSEUR DISPONIBLE → CRÉDITS. Le fournisseur n'est jamais appelé ici.
export async function preflight(module: ProviderModule, c: {
  supabase: SupabaseClient; userId: string; prompt: string; params?: unknown; context?: string; cost: number; preferredId?: string | null; onlyId?: string | null;
}): Promise<PreflightResult> {
  const mod = await moderateGenerationRequest({ module, prompt: c.prompt, params: c.params, context: c.context }, c.userId);
  if (!mod.allowed) { logEvent("generation_blocked", { module, code: "CONTENT_BLOCKED" }); return deny("CONTENT_BLOCKED", moderationMessage(mod)); }
  const sub = await getCurrentSubscription(c.supabase, c.userId); // l'abonnement vient de la base, jamais du fournisseur ni du navigateur
  if (sub?.status === "suspended") return deny("ACCOUNT_SUSPENDED"); // « expiré » : règles existantes (le solde de crédits décide)
  if (await hasInFlightGeneration(c.supabase, c.userId, module)) return deny("USER_RATE_LIMITED");
  if (getProviderChain(module, { preferredId: c.preferredId, onlyId: c.onlyId }).length === 0) return deny("NO_PROVIDER");
  const { data: slot, error: slotError } = await c.supabase.rpc("consume_generation_rate_slot", {
    p_module: module,
    p_limit: RATE_LIMITS_PER_MINUTE[module],
    p_window_seconds: 60,
  });
  if (slotError || slot !== true) return deny("USER_RATE_LIMITED");
  if (!(await hasEnoughCredits(c.supabase, c.userId, c.cost))) return deny("INSUFFICIENT_CREDITS", `Crédits insuffisants : cette demande coûte ${c.cost} crédit(s).`);
  return { ok: true };
}

export type Job<R> = { status: "completed"; result: R } | { status: "processing"; jobId: string } | { status: "failed"; error: string };
// Un fournisseur est NON FIABLE tant que son résultat n'est pas validé : résultat invalide → échec, aucun crédit.
export function validateJobWith<R>(parse: (raw: unknown) => R | null) {
  return (job: Job<R>): Job<R> => {
    if (job.status === "failed") throw new ProviderError("GENERATION_FAILED", "reported_failed");
    if (job.status === "processing") {
      if (typeof job.jobId !== "string" || !job.jobId || job.jobId.length > 200) throw new ProviderError("RESULT_INVALID", "job_id");
      return job;
    }
    const result = parse(job.result);
    if (!result) throw new ProviderError("RESULT_INVALID", "result");
    return { status: "completed", result };
  };
}

export type Settled<R> = { state: "done"; result: R } | { state: "already_done" } | { state: "processing" } | { state: "failed"; code: ErrorCode; message: string };
// Finalisation commune (génération directe ET suivi de job). Débit unique et atomique en base, uniquement pour un résultat validé.
export async function settleJob<R>(a: { id: string; providerId: string; job: Job<R>; cost: number; jobId?: string; persist?: (r: R) => Promise<R> }): Promise<Settled<R>> {
  const bail = async (code: ErrorCode): Promise<Settled<R>> => { await failGeneration(a.id, code, a.providerId); logEvent("generation_failed", { generationId: a.id, provider: a.providerId, code }); return { state: "failed", code, message: USER_MESSAGES[code] }; };
  if (a.job.status === "failed") return bail("GENERATION_FAILED");
  if (a.job.status === "processing") { await setProcessing(a.id, a.job.jobId, a.providerId); return { state: "processing" }; }
  let result: R;
  try { result = a.persist ? await a.persist(a.job.result) : a.job.result; }
  catch { return bail("GENERATION_FAILED"); }
  const done = await completeGeneration(a.id, result, a.cost, { providerId: a.providerId, jobId: a.jobId });
  if (!done.ok) {
    if (done.alreadyFinal) return { state: "already_done" }; // finalisation concurrente (double clic, relance) : la base a refusé, aucun second débit
    return bail(done.insufficient ? "INSUFFICIENT_CREDITS" : "GENERATION_FAILED");
  }
  logEvent("generation_completed", { generationId: a.id, provider: a.providerId });
  return { state: "done", result };
}
