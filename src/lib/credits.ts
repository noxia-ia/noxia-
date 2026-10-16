import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCredits(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from("profiles").select("credits").eq("user_id", userId).maybeSingle<{ credits: number }>();
  return data?.credits ?? 0;
}
export async function hasEnoughCredits(supabase: SupabaseClient, userId: string, amount: number) {
  return (await getCredits(supabase, userId)) >= amount;
}
// Admin uniquement (revérifié en base via la session de l'administrateur).
export async function adminAdjustCredits(supabase: SupabaseClient, userId: string, delta: number): Promise<number> {
  const { data, error } = await supabase.rpc("admin_adjust_credits", { p_user_id: userId, p_delta: delta });
  if (error) throw error;
  return data as number;
}
