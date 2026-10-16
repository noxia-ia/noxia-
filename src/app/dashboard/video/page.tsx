import { getSessionProfile } from "@/lib/auth";
import { getCurrentSubscription } from "@/lib/subscription";
import { canDownloadWithoutFilingram } from "@/lib/download-policy";
import { ContentNotice } from "@/components/safety/ContentNotice";
import { getVideoProvider } from "@/lib/ai/video";
import { parseVideoParams, parseVideoResult } from "@/lib/ai/video/validate";
import type { VideoStatus } from "@/lib/ai/video/types";
import { VideoWorkspace } from "@/components/video/VideoWorkspace";
import type { VideoDisplay } from "@/modules/video/types";

export default async function VideoPage() {
  const { supabase, user, profile } = await getSessionProfile();
  // RLS + filtre explicite : uniquement les vidéos de l'utilisateur connecté.
  const { data, error } = await supabase.from("generations")
    .select("id,prompt,status,created_at,completed_at,error_message,params,result")
    .eq("user_id", user.id).eq("module", "video").order("created_at", { ascending: false }).limit(15);
  const history: VideoDisplay[] = (data ?? []).map(g => ({
    id: g.id, prompt: g.prompt ?? "", status: g.status as VideoStatus, createdAt: g.created_at, completedAt: g.completed_at ?? null,
    error: g.error_message ?? null, params: parseVideoParams(g.params), result: parseVideoResult(g.result),
  }));
  const credits = profile?.credits ?? 0;
  const subscription = await getCurrentSubscription(supabase, user.id);
  const canUnwatermarkedVideo = canDownloadWithoutFilingram(subscription);
  return (
    <main className="mx-auto max-w-4xl p-5 md:p-10">
      <h1 className="font-display text-3xl tracking-widest text-noxia-silver">NOXIA VIDEO</h1>
      <p className="mt-2 text-noxia-ash">Décris ta vidéo et règle le style, la durée, le format, la qualité, la caméra et le mouvement. La création est traitée en arrière-plan puis suivie depuis ton historique.</p>
      <p className="mt-4 inline-block rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Crédits disponibles : {credits}</p>
      <ContentNotice />
      <div className="mt-6"><VideoWorkspace credits={credits} engineReady={getVideoProvider() !== null} history={history} historyError={!!error} canUnwatermarkedVideo={canUnwatermarkedVideo} /></div>
    </main>
  );
}
