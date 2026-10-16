"use server";

import { createClient } from "@/lib/supabase/server";

export type DailyClaimResult =
  | { ok: true; claimed: boolean; alreadyClaimed: boolean; streakDay: number; creditsGranted: number; balance: number; nextStreakDay: number }
  | { ok: false; message: string };

export async function claimDailyCreditAction(): Promise<DailyClaimResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Connecte-toi pour récupérer ton bonus quotidien." };

  const { data, error } = await supabase.rpc("claim_daily_credit");
  if (error) {
    console.error("claim_daily_credit failed", error);
    return { ok: false, message: "Impossible de récupérer le bonus quotidien pour le moment." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, message: "Réponse invalide du serveur." };

  return {
    ok: true,
    claimed: Boolean(row.claimed),
    alreadyClaimed: Boolean(row.already_claimed),
    streakDay: Number(row.streak_day),
    creditsGranted: Number(row.credits_granted),
    balance: Number(row.balance),
    nextStreakDay: Number(row.next_streak_day),
  };
}
