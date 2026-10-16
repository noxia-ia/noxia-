import type { CampaignVerifier, ProviderName, CampaignVerificationResult } from "./provider-contract";

export class VerificationRegistry {
  private readonly providers = new Map<ProviderName, CampaignVerifier>();

  register(provider: ProviderName, verifier: CampaignVerifier) {
    this.providers.set(provider, verifier);
  }

  isConfigured(provider: ProviderName) {
    return this.providers.has(provider);
  }

  async verify(input: {
    campaignId: string;
    userId: string;
    provider: ProviderName;
    action: "follow" | "subscribe" | "visit" | "custom";
  }): Promise<CampaignVerificationResult> {
    const verifier = this.providers.get(input.provider);

    // Fail closed: an unsupported provider can never produce a reward.
    if (!verifier) {
      return {
        watchCompleted: false,
        actionVerified: false,
        rejectionReason: "provider_not_configured",
      };
    }

    return verifier.verifyAction(input);
  }
}
