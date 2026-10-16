export const REWARDED_AD_POLICY = {
  adDurationSeconds: 30,
  rewardCredits: 2,
  maxAdsPerDay: 5,
  maxCreditsPerDay: 10,
  requiresFullWatch: true,
  requiresVerifiedSocialAction: false,
  rewardOnlyAfterBothConditions: false,
} as const;

export function rewardConditionMessage(): string {
  return "Regarde la publicité jusqu'à la fin. 2 crédits sont accordés après validation serveur du visionnage, avec une limite de 5 publicités et 10 crédits par jour.";
}
