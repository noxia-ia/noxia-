// Types et validation PARTAGÉS (utilisables côté client ET serveur) — aucun import serveur ici.
export type CampaignStatus = "draft" | "active" | "paused" | "ended";
export type CampaignProvider = "tiktok" | "youtube" | "instagram" | "facebook" | "other";
export type CampaignAction = "subscribe" | "follow" | "like" | "visit";

export const CAMPAIGN_LIMITS = { minDuration: 5, maxDuration: 300, minReward: 2, maxReward: 2 } as const;

export interface CampaignConfig {
  id: string;
  name: string;
  provider: CampaignProvider;
  videoUrl: string;
  action: CampaignAction;
  targetUrl: string;
  durationSeconds: number;
  rewardCredits: number;
  maxRewards: number | null;
  startsAt: string | null; // ISO
  endsAt: string | null; // ISO
  status: CampaignStatus;
}

export const ACTION_LABELS: Record<CampaignAction, string> = {
  subscribe: "S’abonner",
  follow: "Suivre le compte",
  like: "Aimer la publication",
  visit: "Visiter la page",
};

const isHttps = (u: string) => {
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};

// Mêmes bornes que les contraintes SQL de 0016/0017 : le serveur revalide de toute façon.
export function validateCampaign(c: CampaignConfig): string[] {
  const errors: string[] = [];
  if (!c.name.trim()) errors.push("nom");
  if (!isHttps(c.videoUrl)) errors.push("URL vidéo (https)");
  if (!isHttps(c.targetUrl)) errors.push("URL action (https)");
  if (!Number.isInteger(c.durationSeconds) || c.durationSeconds < CAMPAIGN_LIMITS.minDuration || c.durationSeconds > CAMPAIGN_LIMITS.maxDuration)
    errors.push(`durée (${CAMPAIGN_LIMITS.minDuration}–${CAMPAIGN_LIMITS.maxDuration} s)`);
  if (!Number.isInteger(c.rewardCredits) || c.rewardCredits < CAMPAIGN_LIMITS.minReward || c.rewardCredits > CAMPAIGN_LIMITS.maxReward)
    errors.push(`crédits (${CAMPAIGN_LIMITS.minReward}–${CAMPAIGN_LIMITS.maxReward})`);
  if (c.maxRewards !== null && (!Number.isInteger(c.maxRewards) || c.maxRewards < 1)) errors.push("plafond");
  if (c.startsAt && c.endsAt && Date.parse(c.endsAt) <= Date.parse(c.startsAt)) errors.push("dates");
  return errors;
}

// Ligne SQL (snake_case) → configuration (camelCase).
export interface CampaignRow {
  id: string; title: string; platform: CampaignProvider; video_url: string; destination_url: string;
  duration_seconds: number; reward_credits: number; required_action: CampaignAction; max_rewards: number | null;
  starts_at: string | null; ends_at: string | null; status: CampaignStatus;
}
export function rowToConfig(r: CampaignRow): CampaignConfig {
  return {
    id: r.id, name: r.title, provider: r.platform, videoUrl: r.video_url, action: r.required_action, targetUrl: r.destination_url,
    durationSeconds: r.duration_seconds, rewardCredits: r.reward_credits, maxRewards: r.max_rewards,
    startsAt: r.starts_at, endsAt: r.ends_at, status: r.status,
  };
}
