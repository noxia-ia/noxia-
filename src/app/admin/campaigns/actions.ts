"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { UUID_RE } from "@/lib/validation";
import { validateCampaign } from "@/lib/admin/campaign-types";
import type { CampaignConfig, CampaignStatus } from "@/lib/admin/campaign-types";
import { getVerificationRegistry, providerForPlatform } from "@/lib/campaigns/registry";
import type { AdminResult } from "@/components/NoxiaAdminCampaignPanel";

const STATUSES: CampaignStatus[] = ["draft", "active", "paused", "ended"];
const PLATFORMS = ["tiktok", "youtube", "instagram", "facebook", "other"];
const ACTIONS = ["subscribe", "follow", "like", "visit"];

function friendly(m: string): string {
  if (m.includes("not_authorized")) return "Accès refusé.";
  if (m.includes("invalid_url")) return "Les URLs doivent commencer par https://.";
  if (m.includes("invalid_dates")) return "La date de fin doit suivre la date de début.";
  if (m.includes("campaign_not_found")) return "Campagne introuvable (enregistre-la d’abord).";
  if (m.includes("check constraint") || m.includes("invalid_campaign")) return "Valeurs invalides (durée, crédits ou plafond hors limites).";
  return "Erreur lors de l’enregistrement.";
}

// Le rôle admin est relu en base (requireAdmin) ET revérifié dans la fonction SQL (is_admin()). Le navigateur n'écrit jamais dans les tables.
export async function saveCampaignAction(c: CampaignConfig): Promise<AdminResult> {
  const { supabase } = await requireAdmin();
  if (!UUID_RE.test(c.id) || !PLATFORMS.includes(c.provider)) return { ok: false, error: "Requête invalide." };
  // Phase 1: rewarded ads require only a server-validated full watch.
  // Legacy SQL keeps required_action for compatibility, but the admin cannot
  // configure a social action that would become a hidden reward condition.
  const normalizedCampaign = { ...c, action: "visit" as const, rewardCredits: 2 };
  const problems = validateCampaign(normalizedCampaign);
  if (problems.length) return { ok: false, error: `À corriger : ${problems.join(", ")}` };
  const slug = `${c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "campagne"}-${c.id.slice(0, 8)}`;
  const { error } = await supabase.rpc("admin_save_campaign", {
    p_id: normalizedCampaign.id, p_slug: slug, p_title: normalizedCampaign.name, p_platform: normalizedCampaign.provider, p_video_url: normalizedCampaign.videoUrl, p_destination_url: normalizedCampaign.targetUrl,
    p_duration_seconds: normalizedCampaign.durationSeconds, p_reward_credits: 2, p_required_action: "visit", p_max_rewards: normalizedCampaign.maxRewards,
    p_starts_at: normalizedCampaign.startsAt, p_ends_at: normalizedCampaign.endsAt,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/admin/campaigns"); revalidatePath("/dashboard/rewards");
  return { ok: true };
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus): Promise<AdminResult> {
  const { supabase } = await requireAdmin();
  if (!UUID_RE.test(id) || !STATUSES.includes(status)) return { ok: false, error: "Requête invalide." };

  if (status === "active") {
    // Porte de production : on n'active pas une campagne dont la plateforme n'a aucun vérificateur serveur configuré.
    const { data: row } = await supabase.from("reward_campaigns").select("platform").eq("id", id).maybeSingle<{ platform: string }>();
    if (!row) return { ok: false, error: "Campagne introuvable." };
    if (!getVerificationRegistry().isConfigured(providerForPlatform(row.platform)))
      return { ok: false, error: "Activation refusée : aucun vérificateur officiel n’est configuré pour cette plateforme (voir docs/SOCIAL_PROVIDER_GATE.md)." };
  }
  const { error } = await supabase.rpc("admin_set_campaign_status", { p_id: id, p_status: status });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/admin/campaigns"); revalidatePath("/dashboard/rewards");
  return { ok: true };
}
