/**
 * Provider-neutral campaign verification contract.
 *
 * IMPORTANT:
 * - Never trust a browser boolean such as `actionVerified: true`.
 * - A provider adapter must validate an official API/OAuth/webhook response.
 * - The adapter returns evidence; the server decides whether the campaign
 *   conditions are satisfied and then calls the existing reward ledger.
 */

export type ProviderName = "tiktok" | "youtube" | "instagram" | "facebook" | "internal";

export interface ProviderEvidence {
  provider: ProviderName;
  providerEventId?: string;
  userReference: string;
  action: "follow" | "subscribe" | "visit" | "custom";
  verifiedAt: string;
  expiresAt?: string;
  rawReference?: string;
}

export interface CampaignVerificationResult {
  watchCompleted: boolean;
  actionVerified: boolean;
  evidence?: ProviderEvidence;
  rejectionReason?: string;
}

export interface CampaignVerifier {
  verifyAction(input: {
    campaignId: string;
    userId: string;
    provider: ProviderName;
    action: ProviderEvidence["action"];
  }): Promise<CampaignVerificationResult>;
}
