import { requireAdmin } from "@/lib/auth";
import { NoxiaAdminCampaignPanel } from "@/components/NoxiaAdminCampaignPanel";
import { rowToConfig, type CampaignRow } from "@/lib/admin/campaign-types";
import { internalVerifierEnabled } from "@/lib/campaigns/registry";
import { saveCampaignAction, setCampaignStatusAction } from "./actions";

export default async function AdminCampaignsPage() {
  const { supabase } = await requireAdmin();
  // RLS : la politique « reward_campaigns_admin_read » (is_admin()) montre aussi les brouillons.
  const { data } = await supabase.from("reward_campaigns")
    .select("id,title,platform,video_url,destination_url,duration_seconds,reward_credits,required_action,max_rewards,starts_at,ends_at,status")
    .order("created_at", { ascending: false }).returns<CampaignRow[]>();
  return (
    <>
      <h1 className="font-display text-3xl text-noxia-silver">Campagnes récompensées</h1>
      <p className="mt-2 text-sm text-noxia-ash">
        Un vérificateur interne de test est {internalVerifierEnabled() ? <strong className="text-noxia-violet">ACTIF (développement uniquement)</strong> : "désactivé"}.
        La récompense Phase 1 dépend uniquement du visionnage complet validé côté serveur. Les colonnes d’action sociales historiques restent conservées pour compatibilité.
      </p>
      <div className="mt-6">
        <NoxiaAdminCampaignPanel initialCampaigns={(data ?? []).map(rowToConfig)} onSave={saveCampaignAction} onStatusChange={setCampaignStatusAction} />
      </div>
    </>
  );
}
