export type RewardClaimResult =
  | { ok: true; creditsGranted: number; newBalance?: number }
  | { ok: false; reason: "already_claimed" | "not_verified" | "campaign_unavailable" | "ledger_failed" };

export interface VerifiedRewardInput {
  campaignId: string;
  watchCompleted: true;
  /** Legacy compatibility field. Phase 1 rewards require only server-verified watch. */
  actionVerified?: true;
  idempotencyKey: string;
}

/**
 * Server contract only.
 * The implementation must:
 * 1) verify the provider evidence;
 * 2) atomically reserve the one-time campaign claim;
 * 3) call the existing NOXIA credit ledger;
 * 4) return the authoritative balance (or trigger the existing realtime balance update).
 *
 * The browser must never calculate or persist the balance.
 */
