export interface CampaignWatchState {
  startedAt: number | null;
  completed: boolean;
  /** Legacy field retained for compatibility; Phase 1 rewarded ads do not require it. */
  actionVerified?: boolean;
  rewarded: boolean;
}

export function watchCompletionThreshold(durationSeconds: number) {
  // Keep the threshold server-configurable later; this is a client display helper only.
  return Math.max(1, Math.ceil(durationSeconds));
}

export function campaignReadyForReward(state: CampaignWatchState) {
  return state.completed && !state.rewarded;
}
