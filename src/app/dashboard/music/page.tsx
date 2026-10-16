import { getSessionProfile } from "@/lib/auth";
import { getMusicProvider } from "@/lib/ai/music";
import { parseMusicParams, parseMusicResult } from "@/lib/ai/music/validate";
import type { MusicDisplay } from "@/modules/music/types";
import { MusicWorkspace } from "@/components/music/MusicWorkspace";

export default async function MusicPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const { data } = await supabase.from("generations").select("id,prompt,status,created_at,completed_at,error_message,params,result").eq("user_id", user.id).eq("module", "music").order("created_at", { ascending: false }).limit(15);
  const history: MusicDisplay[] = (data ?? []).map(g => ({ id: g.id, prompt: g.prompt ?? "", status: g.status as MusicDisplay["status"], createdAt: g.created_at, completedAt: g.completed_at ?? null, error: g.error_message ?? null, params: parseMusicParams(g.params), result: parseMusicResult(g.result) }));
  return <main className="mx-auto max-w-4xl p-5 md:p-10"><h1 className="font-display text-3xl tracking-widest text-noxia-silver">NOXIA MUSIC</h1><p className="mt-2 text-noxia-ash">Crée des musiques originales pour tes vidéos, dramas, jeux, contenus sociaux ou simplement pour écouter.</p><p className="mt-4 inline-block rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Crédits disponibles : {profile?.credits ?? 0}</p><div className="mt-6"><MusicWorkspace credits={profile?.credits ?? 0} engineReady={getMusicProvider() !== null} history={history} /></div></main>;
}
