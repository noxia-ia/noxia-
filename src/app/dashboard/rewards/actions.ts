"use server";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/validation";
import { startWatch, heartbeatWatch, completeWatch, claimReward, REASON_MESSAGES, type RewardReason } from "@/lib/campaigns/service";

// L'identité vient TOUJOURS de la session serveur, jamais d'un paramètre du navigateur.
async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type ActionState =
  | { ok: true; startedAtMs?: number; serverNowMs?: number; durationSeconds?: number; creditsGranted?: number; alreadyClaimed?: boolean; balance?: number | null }
  | { ok: false; reason: RewardReason | "unauthenticated" | "invalid"; message: string };

const fail = (reason: RewardReason | "unauthenticated" | "invalid", message?: string): ActionState => ({
  ok: false, reason, message: message ?? (reason === "unauthenticated" ? "Connecte-toi pour continuer." : reason === "invalid" ? "Requête invalide." : REASON_MESSAGES[reason]),
});

export async function startRewardWatchAction(campaignId: string): Promise<ActionState> {
  if (!UUID_RE.test(campaignId)) return fail("invalid");
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const r = await startWatch(userId, campaignId);
  return r.ok ? r : fail(r.reason);
}


export async function heartbeatRewardWatchAction(campaignId: string): Promise<ActionState> {
  if (!UUID_RE.test(campaignId)) return fail("invalid");
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const r = await heartbeatWatch(userId, campaignId);
  return r.ok ? { ok: true } : fail(r.reason);
}

export async function completeRewardWatchAction(campaignId: string): Promise<ActionState> {
  if (!UUID_RE.test(campaignId)) return fail("invalid");
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const r = await completeWatch(userId, campaignId);
  return r.ok ? { ok: true } : fail(r.reason);
}

export async function claimRewardAction(campaignId: string): Promise<ActionState> {
  if (!UUID_RE.test(campaignId)) return fail("invalid");
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const r = await claimReward(userId, campaignId);
  return r.ok ? r : fail(r.reason);
}
