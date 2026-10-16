import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/providers/log";

// Fenêtres de chat glissantes (migration 0051). Durées par plan : Free 3 h 30, Plus 6 h, Pro 9 h, Ultra 12 h — stockées en base (table chat_window_rules), modifiables par l'administrateur.
// Plafond de crédits par fenêtre : NULL à la livraison (aucune nouvelle limite). Le plan vient de l'ABONNEMENT EN BASE (jamais du navigateur).
import { resolveWindowTier, type WindowPlan } from "@/lib/chat-window-plan";
export type { WindowPlan };

// Plan actif : abonnement actif (échéance + 24 h de grâce) → son palier ; sinon « free ». Anciennes formules à durée (daily…annual) : palier selon leur durée (voir chat-window-plan.ts).
export function resolveWindowPlan(sub: { status: string; plan: string; expires_at: string | null } | null): WindowPlan {
  return resolveWindowTier(sub);
}

export type WindowEnter =
  | { ok: true; windowId: string | null; endsAt: string | null }
  | { ok: false; reason: "window_cap"; endsAt: string; message: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export async function enterChatWindow(userId: string, plan: WindowPlan, cost: number): Promise<WindowEnter> {
  try {
    const { data, error } = await createAdminClient().rpc("chat_window_enter", { p_user_id: userId, p_plan: plan, p_cost: cost });
    if (error) {
      // Migration 0051 pas encore appliquée (fonction absente) ou panne technique : le chat continue (aucun plafond n'existe sans la migration) ; l'incident est journalisé.
      logEvent("chat_window_unavailable", { code: String(error.code ?? "unknown").slice(0, 12) });
      return { ok: true, windowId: null, endsAt: null };
    }
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; window_id?: string; ends_at?: string } | undefined;
    if (!row || typeof row.allowed !== "boolean") return { ok: true, windowId: null, endsAt: null };
    if (!row.allowed && row.ends_at) return { ok: false, reason: "window_cap", endsAt: row.ends_at, message: `Tu as atteint la limite de messages de ta fenêtre de chat. Une nouvelle fenêtre s'ouvrira après ${fmt(row.ends_at)}.` };
    return { ok: true, windowId: row.window_id ?? null, endsAt: row.ends_at ?? null };
  } catch {
    logEvent("chat_window_unavailable", { code: "exception" });
    return { ok: true, windowId: null, endsAt: null };
  }
}

// Annule la comptabilisation d'un message non livré (échec fournisseur, crédits insuffisants) : même moment que le remboursement de la réservation de crédits.
export async function releaseChatWindow(userId: string, windowId: string | null, cost: number): Promise<void> {
  if (!windowId) return;
  try { await createAdminClient().rpc("chat_window_release", { p_user_id: userId, p_window_id: windowId, p_cost: cost }); } catch { logEvent("chat_window_release_failed", {}); }
}

// Quota de générations de CODE (0 crédit) par fenêtre glissante — même fenêtre que le chat (migration 0054, fonction code_quota_enter).
// Migration absente ou panne technique : on laisse passer (comme le chat) et l'incident est journalisé.
export type CodeQuota = { ok: true; windowId: string | null } | { ok: false; message: string };
export async function enterCodeQuota(userId: string, plan: WindowPlan): Promise<CodeQuota> {
  try {
    const { data, error } = await createAdminClient().rpc("code_quota_enter", { p_user_id: userId, p_plan: plan });
    if (error) { logEvent("chat_window_unavailable", { code: String(error.code ?? "unknown").slice(0, 12) }); return { ok: true, windowId: null }; }
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; window_id?: string; ends_at?: string; max_code?: number } | undefined;
    if (!row || typeof row.allowed !== "boolean") return { ok: true, windowId: null };
    if (!row.allowed && row.ends_at) return { ok: false, message: `Tu as atteint ta limite de ${row.max_code ?? ""} générations de code pour cette période. Une nouvelle période s'ouvrira après ${fmt(row.ends_at)}.`.replace("  ", " ") };
    return { ok: true, windowId: row.window_id ?? null };
  } catch { logEvent("chat_window_unavailable", { code: "exception" }); return { ok: true, windowId: null }; }
}
export async function releaseCodeQuota(userId: string, windowId: string | null): Promise<void> {
  if (!windowId) return;
  try { await createAdminClient().rpc("code_quota_release", { p_user_id: userId, p_window_id: windowId }); } catch { logEvent("chat_window_release_failed", {}); }
}
