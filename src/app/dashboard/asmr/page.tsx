import { getSessionProfile } from "@/lib/auth";
import { ContentNotice } from "@/components/safety/ContentNotice";
import { getASMRProvider } from "@/lib/ai/asmr";
import { parseASMRParams, parseASMRResult } from "@/lib/ai/asmr/validate";
import { ASMRWorkspace } from "@/components/asmr/ASMRWorkspace";
import type { ASMRDisplay } from "@/modules/asmr/types";
import type { ASMRStatus } from "@/lib/ai/asmr/types";

export default async function ASMRPage() {
  const { supabase, user, profile } = await getSessionProfile();
  // RLS + filtre explicite : uniquement les générations de l'utilisateur connecté.
  const { data, error } = await supabase.from("generations")
    .select("id,prompt,status,created_at,completed_at,error_message,params,result")
    .eq("user_id", user.id).eq("module", "asmr").order("created_at", { ascending: false }).limit(15);
  const history: ASMRDisplay[] = (data ?? []).map(g => ({
    id: g.id, prompt: g.prompt ?? "", status: g.status as ASMRStatus, createdAt: g.created_at, completedAt: g.completed_at ?? null,
    error: g.error_message ?? null, params: parseASMRParams(g.params), result: parseASMRResult(g.result),
  }));
  const credits = profile?.credits ?? 0;
  return (
    <main className="mx-auto max-w-4xl p-5 md:p-10">
      <h1 className="font-display text-3xl tracking-widest text-noxia-silver">NOXIA AUDIO</h1>
      <p className="mt-2 text-noxia-ash">Décris une scène ASMR et choisis les paramètres.</p>
      <p className="mt-4 inline-block rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Crédits disponibles : {credits}</p>
      <ContentNotice />
      <div className="mt-6"><ASMRWorkspace credits={credits} engineReady={getASMRProvider() !== null} history={history} historyError={!!error} /></div>
    </main>
  );
}
