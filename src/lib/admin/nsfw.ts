import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Module admin NSFW / mini-séries.
 * Zero-Knowledge : aucune lecture de messages, prompts ou résultats de génération.
 * Les garde-fous d'âge s'appliquent au niveau paiement / accès module, pas au contenu des chats.
 */

export interface ContentSettings {
  nsfw_enabled: boolean;
  nsfw_requires_age_verified: boolean;
  nsfw_requires_paid_plan: boolean;
  mini_series_nsfw_allowed: boolean;
  content_policy_mode: string;
  updated_at?: string;
}

export interface NsfwStats {
  content_blocked_generations: number;
  age_restricted_generations: number;
  age_verified_users: number;
  age_unverified_users: number;
  window_days: number;
}

export async function fetchContentSettings(supabase: SupabaseClient): Promise<ContentSettings> {
  const { data, error } = await supabase.rpc("admin_get_content_settings");
  if (error || !data) {
    return {
      nsfw_enabled: false,
      nsfw_requires_age_verified: true,
      nsfw_requires_paid_plan: true,
      mini_series_nsfw_allowed: false,
      content_policy_mode: "strict",
    };
  }
  const o = data as Record<string, unknown>;
  return {
    nsfw_enabled: Boolean(o.nsfw_enabled),
    nsfw_requires_age_verified: Boolean(o.nsfw_requires_age_verified),
    nsfw_requires_paid_plan: Boolean(o.nsfw_requires_paid_plan),
    mini_series_nsfw_allowed: Boolean(o.mini_series_nsfw_allowed),
    content_policy_mode: String(o.content_policy_mode ?? "strict"),
    updated_at: o.updated_at ? String(o.updated_at) : undefined,
  };
}

export async function updateContentSettings(
  supabase: SupabaseClient,
  s: Omit<ContentSettings, "content_policy_mode" | "updated_at">
): Promise<{ ok: true; settings: ContentSettings } | { ok: false; message: string }> {
  // Garde-fou applicatif (doublé côté SQL)
  if (s.nsfw_enabled && !s.nsfw_requires_age_verified) {
    return { ok: false, message: "La vérification d'âge est obligatoire si le NSFW est activé." };
  }
  const { data, error } = await supabase.rpc("admin_update_content_settings", {
    p_nsfw_enabled: s.nsfw_enabled,
    p_nsfw_requires_age_verified: s.nsfw_requires_age_verified,
    p_nsfw_requires_paid_plan: s.nsfw_requires_paid_plan,
    p_mini_series_nsfw_allowed: s.mini_series_nsfw_allowed,
  });
  if (error) return { ok: false, message: error.message.includes("age_verification")
    ? "La vérification d'âge est obligatoire si le NSFW est activé."
    : "Impossible d'enregistrer les paramètres." };
  const o = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    settings: {
      nsfw_enabled: Boolean(o.nsfw_enabled),
      nsfw_requires_age_verified: Boolean(o.nsfw_requires_age_verified),
      nsfw_requires_paid_plan: Boolean(o.nsfw_requires_paid_plan),
      mini_series_nsfw_allowed: Boolean(o.mini_series_nsfw_allowed),
      content_policy_mode: String(o.content_policy_mode ?? "strict"),
      updated_at: o.updated_at ? String(o.updated_at) : undefined,
    },
  };
}

export async function fetchNsfwStats(supabase: SupabaseClient, days = 30): Promise<NsfwStats> {
  const { data, error } = await supabase.rpc("admin_nsfw_stats", { p_days: days });
  if (error || !data) {
    return {
      content_blocked_generations: 0,
      age_restricted_generations: 0,
      age_verified_users: 0,
      age_unverified_users: 0,
      window_days: days,
    };
  }
  const o = data as Record<string, unknown>;
  return {
    content_blocked_generations: Number(o.content_blocked_generations) || 0,
    age_restricted_generations: Number(o.age_restricted_generations) || 0,
    age_verified_users: Number(o.age_verified_users) || 0,
    age_unverified_users: Number(o.age_unverified_users) || 0,
    window_days: Number(o.window_days) || days,
  };
}
