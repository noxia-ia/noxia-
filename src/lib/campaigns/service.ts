import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerificationRegistry, providerForPlatform, verificationAction } from "./registry";

/** Codes de résultat sérialisables (aucun message SQL brut n'est renvoyé au navigateur). */
export type RewardReason =
  | "campaign_inactive" | "campaign_exhausted" | "watch_not_started" | "watch_incomplete"
  | "action_not_verified" | "verifier_unavailable" | "not_ready" | "watch_presence_missing" | "daily_reward_limit" | "unexpected";

export type StartWatchResult =
  | { ok: true; startedAtMs: number; serverNowMs: number; durationSeconds: number }
  | { ok: false; reason: RewardReason };
export type CompleteWatchResult = { ok: true } | { ok: false; reason: RewardReason; remainingSeconds?: number };
export type HeartbeatWatchResult = { ok: true } | { ok: false; reason: RewardReason };
export type ClaimResult =
  | { ok: true; creditsGranted: number; alreadyClaimed: boolean; balance: number | null }
  | { ok: false; reason: RewardReason };

function mapError(message: string): RewardReason {
  if (message.includes("campaign_inactive")) return "campaign_inactive";
  if (message.includes("campaign_exhausted")) return "campaign_exhausted";
  if (message.includes("watch_not_started")) return "watch_not_started";
  if (message.includes("watch_incomplete")) return "watch_incomplete";
  if (message.includes("reward_conditions_not_met") || message.includes("reward_claim_missing")) return "not_ready";
  if (message.includes("watch_presence_missing")) return "watch_presence_missing";
  if (message.includes("daily_reward_limit")) return "daily_reward_limit";
  return "unexpected";
}

export async function startWatch(userId: string, campaignId: string): Promise<StartWatchResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("start_reward_watch", { p_campaign_id: campaignId, p_user_id: userId });
  if (error || !data) return { ok: false, reason: error ? mapError(error.message) : "unexpected" };
  const { data: c } = await admin.from("reward_campaigns").select("duration_seconds").eq("id", campaignId).maybeSingle<{ duration_seconds: number }>();
  return { ok: true, startedAtMs: Date.parse(String(data)), serverNowMs: Date.now(), durationSeconds: c?.duration_seconds ?? 30 };
}

export async function heartbeatWatch(userId: string, campaignId: string): Promise<HeartbeatWatchResult> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("heartbeat_reward_watch", { p_campaign_id: campaignId, p_user_id: userId });
  if (!error) return { ok: true };
  return { ok: false, reason: mapError(error.message) };
}

export async function completeWatch(userId: string, campaignId: string): Promise<CompleteWatchResult> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("complete_reward_watch", { p_campaign_id: campaignId, p_user_id: userId });
  if (!error) return { ok: true };
  return { ok: false, reason: mapError(error.message) };
}

/**
 * Réclamation : le visionnage doit déjà être validé par le serveur.
 * Le finaliseur SQL applique ensuite +2 crédits et le plafond quotidien atomique.
 * Rien de ce que dit le navigateur n'est utilisé comme preuve.
 */
export async function claimReward(userId: string, campaignId: string): Promise<ClaimResult> {
  const admin = createAdminClient();

  // Phase 1 rewarded ads require only a server-validated full watch.
  // Legacy social-action columns remain in the schema for compatibility, but
  // they are not a reward condition for NOXIA rewarded ads.
  const { data: campaign } = await admin.from("reward_campaigns")
    .select("active").eq("id", campaignId)
    .maybeSingle<{ active: boolean }>();
  if (!campaign || !campaign.active) return { ok: false, reason: "campaign_inactive" };

  const { data: claim } = await admin.from("reward_claims")
    .select("watch_verified, rewarded_at").eq("campaign_id", campaignId).eq("user_id", userId)
    .maybeSingle<{ watch_verified: boolean; rewarded_at: string | null }>();
  if (claim?.rewarded_at) return { ok: true, creditsGranted: 0, alreadyClaimed: true, balance: await balanceOf(userId) };
  if (!claim?.watch_verified) return { ok: false, reason: "watch_incomplete" };

  // The SQL finalizer is the final authority for +2 and the atomic 5/day cap.
  const { data, error } = await admin.rpc("finalize_reward_claim", {
    p_campaign_id: campaignId,
    p_user_id: userId,
    p_provider: "noxia_rewarded_ads",
    p_provider_subject: null,
  });
  if (error) return { ok: false, reason: mapError(error.message) };

  const granted = Number(data ?? 0);
  return { ok: true, creditsGranted: granted, alreadyClaimed: granted === 0, balance: await balanceOf(userId) };
}

async function balanceOf(userId: string): Promise<number | null> {
  const { data } = await createAdminClient().from("profiles").select("credits").eq("user_id", userId).maybeSingle<{ credits: number }>();
  return data?.credits ?? null;
}

export const REASON_MESSAGES: Record<RewardReason, string> = {
  campaign_inactive: "Cette campagne n’est plus disponible.",
  campaign_exhausted: "Toutes les récompenses de cette campagne ont déjà été distribuées.",
  watch_not_started: "Démarre d’abord la campagne.",
  watch_incomplete: "Le visionnage n’est pas encore terminé.",
  watch_presence_missing: "La présence pendant le visionnage n’a pas pu être confirmée. Reprends la campagne quelques instants.",
  daily_reward_limit: "La limite quotidienne de récompenses a été atteinte. Reviens plus tard.",
  action_not_verified: "Nous n’avons pas pu confirmer ton action. Aucun crédit n’a été ajouté.",
  verifier_unavailable: "La vérification de cette plateforme n’est pas encore disponible. Aucun crédit n’a été ajouté.",
  not_ready: "Les conditions de la récompense ne sont pas encore remplies.",
  unexpected: "Une erreur est survenue. Réessaie dans un instant.",
};
