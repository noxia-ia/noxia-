import "server-only";
import { getEntry, getProviderChain } from "./registry";
import { withTimeout } from "./execute";
import { classifyError, isTransient } from "./errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "./log";
import type { ProviderModule } from "./types";

export type HealthStatus = "ok" | "configured" | "not_configured" | "disabled" | "error" | "temporary_error";
// Libellés de l'administration. « Connecté » = le fournisseur a répondu et accepté la clé lors du dernier test.
export const HEALTH_LABELS: Record<HealthStatus, string> = { ok: "Connecté", configured: "Configuré, non testé", not_configured: "Configuration incomplète", disabled: "Indisponible (désactivé)", error: "Indisponible", temporary_error: "Erreur temporaire" };
// Message générique : le détail d'une panne n'est jamais affiché ni stocké (journal serveur minimal seulement).
export const HEALTH_ERROR_MESSAGE = "Le fournisseur ne répond pas ou refuse la connexion.";

// Vérifie un fournisseur SANS génération payante, SANS prompt et SANS crédit : endpoint de santé s'il existe, sinon configuration seulement.
export async function checkProviderHealth(module: ProviderModule, id: string): Promise<HealthStatus> {
  const entry = getEntry(module, id);
  if (!entry) return "not_configured";
  if (!entry.config.enabled) return "disabled";
  const rp = getProviderChain(module, { onlyId: id })[0];
  if (!rp) return "not_configured"; // clé absente
  if (!rp.provider.healthCheck) return "configured";
  try { return (await withTimeout(5_000, signal => rp.provider.healthCheck!({ signal }))).ok ? "ok" : "error"; }
  catch (e) {
    const err = classifyError(e); // 401/402/403 → indisponible ; 429, 5xx, délai, réseau → erreur temporaire. Aucun détail n'est conservé.
    logEvent("provider_failed", { module, provider: id, code: err.code });
    return isTransient(err.code) ? "temporary_error" : "error";
  }
}

export interface LastCheck { status: HealthStatus; checkedAt: string }
// Dernière vérification (statut + date seulement). Table réservée au serveur (migration 0010) : lecture via la clé serveur, après requireAdmin().
export async function recordHealthCheck(module: ProviderModule, id: string, status: HealthStatus): Promise<void> {
  try { await createAdminClient().from("provider_health_checks").upsert({ module, provider_id: id, status, checked_at: new Date().toISOString() }, { onConflict: "module,provider_id" }); } catch { /* table absente (migration 0010 non exécutée) : sans conséquence */ }
}
export async function loadLastChecks(): Promise<{ checks: Map<string, LastCheck>; available: boolean }> {
  const checks = new Map<string, LastCheck>();
  try {
    const { data, error } = await createAdminClient().from("provider_health_checks").select("module,provider_id,status,checked_at");
    if (error) return { checks, available: false };
    for (const r of (data ?? []) as { module: string; provider_id: string; status: HealthStatus; checked_at: string }[]) checks.set(`${r.module}|${r.provider_id}`, { status: r.status, checkedAt: r.checked_at });
    return { checks, available: true };
  } catch { return { checks, available: false }; }
}
