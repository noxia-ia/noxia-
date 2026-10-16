import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Types strictement agrégés — aucun identifiant utilisateur, aucun message. */
export interface AdminOverview {
  users_total: number;
  new_users_30_days: number;
  active_users_30_days: number;
  plans_active: Record<string, number>;
  generations_total: number;
  generations_completed: number;
  generations_failed: number;
  generations_in_flight: number;
  generations_30_days: number;
  credits_consumed: number;
  credits_consumed_30_days: number;
  media_by_module: Record<string, number>;
  media_by_provider: Record<string, number>;
  daily_claims: number;
  daily_credits_distributed: number;
  rewarded_ad_claims: number;
  rewarded_ad_credits: number;
  age_verified_users: number;
  age_unverified_users: number;
}

export interface MediaEngineRow {
  module: string;
  provider: string;
  generations: number;
  completed: number;
  failed: number;
  credits_used: number;
  share_pct: number;
}

export interface SignupPoint {
  day: string;
  signups: number;
}

export async function fetchAdminOverview(supabase: SupabaseClient): Promise<AdminOverview | null> {
  const { data, error } = await supabase.rpc("admin_analytics_overview");
  if (error || !data) return null;
  const o = data as Record<string, unknown>;
  return {
    users_total: num(o.users_total),
    new_users_30_days: num(o.new_users_30_days),
    active_users_30_days: num(o.active_users_30_days),
    plans_active: (o.plans_active as Record<string, number>) ?? {},
    generations_total: num(o.generations_total),
    generations_completed: num(o.generations_completed),
    generations_failed: num(o.generations_failed),
    generations_in_flight: num(o.generations_in_flight),
    generations_30_days: num(o.generations_30_days),
    credits_consumed: num(o.credits_consumed),
    credits_consumed_30_days: num(o.credits_consumed_30_days),
    media_by_module: (o.media_by_module as Record<string, number>) ?? {},
    media_by_provider: (o.media_by_provider as Record<string, number>) ?? {},
    daily_claims: num(o.daily_claims),
    daily_credits_distributed: num(o.daily_credits_distributed),
    rewarded_ad_claims: num(o.rewarded_ad_claims),
    rewarded_ad_credits: num(o.rewarded_ad_credits),
    age_verified_users: num(o.age_verified_users),
    age_unverified_users: num(o.age_unverified_users),
  };
}

export async function fetchMediaEngineUsage(
  supabase: SupabaseClient,
  days = 30
): Promise<MediaEngineRow[]> {
  const { data, error } = await supabase.rpc("admin_media_engine_usage", { p_days: days });
  if (error || !Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    module: String(r.module ?? "unknown"),
    provider: String(r.provider ?? "unknown"),
    generations: num(r.generations),
    completed: num(r.completed),
    failed: num(r.failed),
    credits_used: num(r.credits_used),
    share_pct: Number(r.share_pct) || 0,
  }));
}

export async function fetchSignupEvolution(
  supabase: SupabaseClient,
  days = 30
): Promise<SignupPoint[]> {
  const { data, error } = await supabase.rpc("admin_signup_evolution", { p_days: days });
  if (error || !Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    day: String(r.day ?? ""),
    signups: num(r.signups),
  }));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
