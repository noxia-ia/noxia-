import type { SupabaseClient } from "@supabase/supabase-js";
import type { Subscription, SubscriptionStatus, HistoryAction } from "@/types/database";

export const STATUS_LABELS: Record<SubscriptionStatus, string> = { active: "Actif", expired: "Expiré", cancelled: "Annulé", pending: "En attente", suspended: "Suspendu" };
export const ACTION_LABELS: Record<HistoryAction, string> = { activate: "Activation", renew: "Renouvellement", suspend: "Suspension", expire: "Expiration", credits: "Crédits" };

// Un plan payant « actif » dont la date est dépassée est considéré comme expiré.
export function effectiveStatus(sub: Pick<Subscription, "status" | "plan" | "expires_at"> | null): SubscriptionStatus {
  if (!sub) return "active";
  if (sub.status === "active" && sub.plan !== "free" && sub.expires_at && new Date(sub.expires_at) < new Date()) return "expired";
  return sub.status;
}
export function formatDate(iso: string | null | undefined) { return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—"; }
export async function getCurrentSubscription(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("subscriptions").select("*").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle<Subscription>();
  return data;
}
