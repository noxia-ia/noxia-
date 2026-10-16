import { getSessionProfile } from "@/lib/auth";
import { NoxiaRewardedCampaign, type RewardedCampaignData } from "@/components/NoxiaRewardedCampaign";
import { LiveCreditBalance } from "@/components/dashboard/LiveCreditBalance";
import { startRewardWatchAction, heartbeatRewardWatchAction, completeRewardWatchAction, claimRewardAction } from "./actions";

type Row = { id: string; title: string; platform: string; video_url: string; destination_url: string; duration_seconds: number; reward_credits: number };

export default async function RewardsPage() {
  const { supabase, user, profile } = await getSessionProfile();
  // RLS : seules les campagnes actives et dans leur fenêtre de dates sont visibles par l'utilisateur.
  const [{ data: rows }, { data: claims }] = await Promise.all([
    supabase.from("reward_campaigns").select("id,title,platform,video_url,destination_url,duration_seconds,reward_credits").eq("active", true).order("created_at", { ascending: false }).returns<Row[]>(),
    supabase.from("reward_claims").select("campaign_id,rewarded_at").eq("user_id", user.id).returns<{ campaign_id: string; rewarded_at: string | null }[]>(),
  ]);
  const rewarded = new Set((claims ?? []).filter(c => c.rewarded_at).map(c => c.campaign_id));
  const campaigns: RewardedCampaignData[] = (rows ?? []).map(r => ({
    id: r.id, title: r.title, platform: r.platform, videoUrl: r.video_url, destinationUrl: r.destination_url,
    durationSeconds: r.duration_seconds, rewardCredits: 2, actionLabel: "Visionnage complet",
  }));

  return (
    <main className="p-5 md:p-10">
      <h1 className="font-display text-3xl text-noxia-silver">Gagner des crédits</h1>
      <p className="mt-2 text-noxia-ash">Chaque publicité récompensée rapporte +2 crédits, avec un maximum de 5 publicités (+10 crédits) par jour. Regarde une campagne jusqu’au bout : aucune action sociale supplémentaire n’est nécessaire. Solde actuel : <strong className="text-noxia-silver"><LiveCreditBalance userId={user.id} initialCredits={profile?.credits ?? 0} /></strong> crédits.</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {campaigns.map(c => (
          <NoxiaRewardedCampaign key={c.id} campaign={c} alreadyRewarded={rewarded.has(c.id)}
            start={startRewardWatchAction} heartbeat={heartbeatRewardWatchAction} complete={completeRewardWatchAction} claim={claimRewardAction} />
        ))}
        {!campaigns.length && <p className="text-noxia-ash">Aucune campagne disponible pour le moment. Reviens bientôt !</p>}
      </div>
    </main>
  );
}
