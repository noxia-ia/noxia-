export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type CampaignAction =
  | "follow"
  | "subscribe"
  | "visit"
  | "custom";

export interface NoxiaCampaign {
  id: string;
  advertiserId: string;
  status: CampaignStatus;
  title: string;
  creativeUrl: string;
  destinationUrl: string;
  durationSeconds: number;
  requiredAction: CampaignAction;
  rewardCredits: number;
  maxRewardedCompletions: number;
}

export interface RewardVerification {
  campaignId: string;
  userId: string;
  watchCompleted: boolean;
  actionVerified: boolean;
  idempotencyKey: string;
}
