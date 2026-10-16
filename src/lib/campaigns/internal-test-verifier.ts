import type { CampaignVerifier } from "./provider-contract";

/**
 * TEST ONLY. Never enable this provider in production.
 * It lets the reward flow be integration-tested without external social APIs.
 */
export class InternalTestVerifier implements CampaignVerifier {
  async verifyAction(): Promise<{
    watchCompleted: boolean;
    actionVerified: boolean;
    evidence: {
      provider: "internal";
      userReference: string;
      action: "follow" | "subscribe" | "visit" | "custom";
      verifiedAt: string;
    };
  }> {
    return {
      watchCompleted: true,
      actionVerified: true,
      evidence: {
        provider: "internal",
        userReference: "integration-test",
        action: "custom",
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}
