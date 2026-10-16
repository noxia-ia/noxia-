import { getSessionProfile } from "@/lib/auth";
import { getProvider } from "@/lib/ai";
import { parseStoredResult } from "@/lib/ai/result";
import { CodeWorkspace } from "@/components/code/CodeWorkspace";
import type { HistoryItem } from "@/modules/code/types";

export default async function CodePage() {
  const { supabase, user, profile } = await getSessionProfile();
  const { data, error } = await supabase.from("generations")
    .select("id,prompt,status,credits_used,created_at,project_type,technology,result")
    .eq("user_id", user.id).eq("module", "code").order("created_at", { ascending: false }).limit(15);
  const history: HistoryItem[] = (data ?? []).map(g => ({ ...g, result: parseStoredResult(g.result) }));
  return (
    <main className="mx-auto max-w-4xl p-5 md:p-10">
      <h1 className="font-display text-3xl tracking-widest text-noxia-silver">NOXIA CODE</h1>
      <p className="mt-2 text-noxia-ash">Décris ce que tu veux construire : site, API, dashboard, base de données ou correction de code.</p>
      <p className="mt-4 inline-block rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Crédits disponibles : {profile?.credits ?? 0}</p>
      <div className="mt-6"><CodeWorkspace credits={profile?.credits ?? 0} engineReady={getProvider() !== null} history={history} historyError={!!error} /></div>
    </main>
  );
}
