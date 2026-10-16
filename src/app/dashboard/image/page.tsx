import { getSessionProfile } from "@/lib/auth";
import { ContentNotice } from "@/components/safety/ContentNotice";
import { getImageProvider } from "@/lib/ai/image";
import { parseImageParams, parseImageResult } from "@/lib/ai/image/validate";
import type { ImageStatus } from "@/lib/ai/image/types";
import { ImageWorkspace } from "@/components/image/ImageWorkspace";
import type { ImageDisplay } from "@/modules/image/types";

export default async function ImagePage() {
  const { supabase, user, profile } = await getSessionProfile();
  // RLS + filtre explicite : uniquement les images de l'utilisateur connecté.
  const { data, error } = await supabase.from("generations")
    .select("id,prompt,status,created_at,completed_at,error_message,params,result")
    .eq("user_id", user.id).eq("module", "image").order("created_at", { ascending: false }).limit(15);
  const history: ImageDisplay[] = (data ?? []).map(g => ({
    id: g.id, prompt: g.prompt ?? "", status: g.status as ImageStatus, createdAt: g.created_at, completedAt: g.completed_at ?? null,
    error: g.error_message ?? null, params: parseImageParams(g.params), result: parseImageResult(g.result),
  }));
  const credits = profile?.credits ?? 0;
  return (
    <main className="mx-auto max-w-4xl p-5 md:p-10">
      <h1 className="font-display text-3xl tracking-widest text-noxia-silver">NOXIA IMAGE</h1>
      <p className="mt-2 text-noxia-ash">Décris ton image et règle le style, le ratio, la qualité, le nombre d'images et le format.</p>
      <p className="mt-4 inline-block rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Crédits disponibles : {credits}</p>
      <ContentNotice />
      <div className="mt-6"><ImageWorkspace credits={credits} engineReady={getImageProvider() !== null} history={history} historyError={!!error} /></div>
    </main>
  );
}
