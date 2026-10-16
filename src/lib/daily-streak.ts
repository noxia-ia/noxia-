// Miroir TypeScript de la règle SQL claim_daily_credit().
// Le crédit réel reste attribué côté serveur par la fonction SQL.
export const DAILY_REWARDS = [1, 1, 1, 2, 2, 3, 5] as const;

export function rewardForDay(day: number): number {
  return DAILY_REWARDS[((Math.max(1, day) - 1) % DAILY_REWARDS.length)];
}

/**
 * Calcule le prochain jour du cycle à partir du dernier instant de claim.
 * Un nouveau claim n'est disponible qu'après 24h.
 * Si 48h ou plus se sont écoulées, une journée est considérée comme manquée
 * et le cycle repart à J1.
 */
export function nextClaimDay(
  state: { streakDay: number; lastClaimAt: string | null } | null,
  now: Date,
): number {
  if (!state || !state.lastClaimAt) return 1;

  const last = Date.parse(state.lastClaimAt);
  if (!Number.isFinite(last)) return 1;

  const elapsed = now.getTime() - last;
  if (elapsed < 24 * 60 * 60 * 1000) {
    return Math.min(7, Math.max(1, state.streakDay));
  }
  if (elapsed >= 48 * 60 * 60 * 1000) return 1;
  return state.streakDay >= 7 ? 1 : state.streakDay + 1;
}

export function canClaimDailyCredit(lastClaimAt: string | null, now: Date): boolean {
  if (!lastClaimAt) return true;
  const last = Date.parse(lastClaimAt);
  return Number.isFinite(last) && now.getTime() - last >= 24 * 60 * 60 * 1000;
}
