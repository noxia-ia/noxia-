import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { USER_MESSAGES, type ErrorCode } from "@/lib/providers/errors";
import { POLL_COOLDOWN_SECONDS } from "@/lib/providers/config";
import type { ModuleId } from "@/types";
import { generationCreditCost } from "@/lib/generation-costs";

// Seules fonctions autorisées à écrire dans `generations`. Appelées uniquement depuis des Server Actions
// APRÈS vérification de la session et de l'âge : le user_id vient du serveur, jamais du navigateur.
export type GenerationAdmission = { id: string | null; error?: "INSUFFICIENT_CREDITS" | "GENERATION_IN_FLIGHT" | "INVALID_CREDIT_COST" | "ERROR" };

export async function createGeneration(i: { userId: string; module: ModuleId; prompt: string; params?: unknown; projectType?: string; technology?: string; credits: number }): Promise<GenerationAdmission> {
  try {
    const expectedCost = generationCreditCost(i.module, i.params);
    if (i.credits !== expectedCost) return { id: null, error: "ERROR" };
    const { data, error } = await createAdminClient().rpc("create_generation_atomic", {
      p_user_id: i.userId,
      p_module: i.module,
      p_prompt: i.prompt,
      p_params: i.params ?? null,
      p_project_type: i.projectType ?? null,
      p_technology: i.technology ?? null,
      p_credits: i.credits,
    });
    if (!error && typeof data === "string") return { id: data };
    const message = String(error?.message ?? "");
    if (message.includes("insufficient_credits")) return { id: null, error: "INSUFFICIENT_CREDITS" };
    if (message.includes("generation_in_flight")) return { id: null, error: "GENERATION_IN_FLIGHT" };
    return { id: null, error: "ERROR" };
  } catch { return { id: null, error: "ERROR" }; } // clé serveur absente, réseau… : l'appelant affiche un message simple, le détail reste côté serveur
}
// Job asynchrone : conserve fournisseur + identifiant de job pour le suivi (polling) ; un webhook futur utilisera les mêmes champs.
export async function setProcessing(id: string, jobId?: string, providerId?: string) {
  const patch: Record<string, unknown> = { status: "processing" };
  if (jobId) patch.provider_job_id = jobId;
  if (providerId) patch.provider = providerId;
  try { await createAdminClient().from("generations").update(patch).eq("id", id).eq("status", "pending"); } catch { /* repris par la tâche de maintenance */ }
}
// Finalise en succès : la base consomme la réservation déjà débitée à l'admission. Aucun second débit.
export async function completeGeneration(id: string, result: unknown, credits: number, meta: { providerId?: string; jobId?: string } = {}): Promise<{ ok: true } | { ok: false; insufficient: boolean; alreadyFinal?: boolean }> {
  let error: { message: string } | null;
  try { ({ error } = await createAdminClient().rpc("finalize_generation", { p_generation_id: id, p_status: "completed", p_result: result, p_credits: credits, p_provider: meta.providerId ?? null, p_job_id: meta.jobId ?? null })); }
  catch { return { ok: false, insufficient: false }; } // jamais de débit si la finalisation n'a pas abouti
  return error ? { ok: false, insufficient: error.message.includes("insufficient_credits"), alreadyFinal: error.message.includes("already_finalized") } : { ok: true };
}
// Échec : aucun crédit consommé ; seul le CODE normalisé et son message utilisateur sont enregistrés (jamais de détail technique).
export async function failGeneration(id: string, code: ErrorCode, providerId?: string) {
  try { await createAdminClient().rpc("finalize_generation", { p_generation_id: id, p_status: "failed", p_error: USER_MESSAGES[code], p_error_code: code, p_provider: providerId ?? null }); } catch { /* la tâche de maintenance clôturera la génération */ }
}

// Suivi (polling) d'un job asynchrone. Réserve ATOMIQUEMENT le droit d'interroger le fournisseur : un seul appel par génération
// toutes les POLL_COOLDOWN_SECONDS (anti double-clic et anti spam). Le client ne fournit que l'identifiant ; tout le reste vient de la base.
export async function claimPoll(id: string): Promise<boolean> {
  const now = Date.now();
  try {
  const { data } = await createAdminClient().from("generations").update({ last_polled_at: new Date(now).toISOString() })
    .eq("id", id).eq("status", "processing")
    .or(`last_polled_at.is.null,last_polled_at.lt.${new Date(now - POLL_COOLDOWN_SECONDS * 1000).toISOString()}`).select("id");
  return (data?.length ?? 0) > 0;
  } catch { return false; }
}
