"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PLANS, isPaidPlan, addDays } from "@/lib/plans";
import { getCurrentSubscription } from "@/lib/subscription";
import { adminAdjustCredits } from "@/lib/credits";
import { UUID_RE } from "@/lib/validation";

function back(id: string, key: "ok" | "err", msg: string): never {
  redirect(`/admin/users/${id}?${key}=${encodeURIComponent(msg)}`);
}
function friendly(m: string) {
  if (m.includes("not_authorized")) return "Accès refusé.";
  if (m.includes("no_subscription")) return "Aucun abonnement à modifier.";
  if (m.includes("user_not_found")) return "Utilisateur introuvable.";
  if (m.includes("invalid_plan_or_dates")) return "Plan ou dates invalides.";
  if (m.includes("check constraint")) return "Crédits insuffisants pour ce retrait.";
  return "Erreur lors de la mise à jour.";
}

// Toutes les valeurs sensibles (expiration, crédits) sont calculées ICI depuis plans.ts, jamais reçues du navigateur.
export async function subscriptionAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!UUID_RE.test(userId)) redirect("/admin");
  const intent = String(formData.get("intent") ?? "");
  if (!["activate", "renew", "suspend", "expire"].includes(intent)) back(userId, "err", "Action invalide.");

  let args: Record<string, unknown> = { p_user_id: userId, p_action: intent };
  if (intent === "activate" || intent === "renew") {
    const plan = String(formData.get("plan") ?? "");
    const date = String(formData.get("start_date") ?? "");
    if (!isPaidPlan(plan)) back(userId, "err", "Choisis un plan.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) back(userId, "err", "Date de début invalide.");
    const cfg = PLANS[plan];
    // Anciennes formules : durée définie dans plans.ts. Niveaux (Plus/Pro/Ultra) : durée saisie par l'admin, bornée côté serveur.
    let days = cfg.durationDays;
    if (days === null) {
      const n = Number(String(formData.get("duration_days") ?? "").trim());
      if (!Number.isInteger(n) || n < 1 || n > 400) back(userId, "err", "Durée requise pour ce plan (1 à 400 jours).");
      days = n;
    }
    let start = new Date(`${date}T00:00:00Z`);
    if (intent === "renew") { // prolonge à partir de la fin actuelle si elle est plus tardive
      const cur = await getCurrentSubscription(supabase, userId);
      if (cur?.expires_at && new Date(cur.expires_at) > start) start = new Date(cur.expires_at);
    }
    args = { ...args, p_plan: plan, p_starts_at: start.toISOString(), p_expires_at: addDays(start, days).toISOString(), p_credits: cfg.credits ?? 0 };
  }
  const { error } = await supabase.rpc("admin_update_subscription", args);
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${userId}`);
  if (error) back(userId, "err", friendly(error.message));
  back(userId, "ok", "Abonnement mis à jour.");
}

export async function adjustCreditsAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!UUID_RE.test(userId)) redirect("/admin");
  const delta = Number.parseInt(String(formData.get("delta") ?? ""), 10);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) back(userId, "err", "Montant de crédits invalide.");
  let failure: string | null = null;
  try { await adminAdjustCredits(supabase, userId, delta); }
  catch (e) { failure = friendly(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "")); }
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${userId}`);
  if (failure) back(userId, "err", failure);
  back(userId, "ok", "Crédits mis à jour.");
}
