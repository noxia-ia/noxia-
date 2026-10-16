import { getSessionProfile } from "@/lib/auth";
import { createSeriesAction, generateSeriesEpisodeAction, refreshSeriesEpisodeAction, addCharacterAction, addEpisodeAction, planSeasonAction, generateSeasonBatchAction } from "./actions";

export default async function SeriesPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const { data: series } = await supabase.from("series").select("id,title,genre,synopsis,seasons,episodes_per_season,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  const ids = (series ?? []).map(s => s.id);
  const { data: episodes } = ids.length ? await supabase.from("series_episodes").select("id,series_id,season_number,episode_number,title,synopsis,status,generation_id").in("series_id", ids).eq("user_id", user.id).order("season_number").order("episode_number") : { data: [] };
  const { data: characters } = ids.length ? await supabase.from("series_characters").select("id,series_id,name,description,traits").in("series_id", ids).eq("user_id", user.id).order("created_at") : { data: [] };
  return <main className="mx-auto max-w-5xl p-5 md:p-10">
    <h1 className="font-display text-3xl tracking-widest text-noxia-silver">NOXIA MINI-SERIES</h1>
    <p className="mt-2 max-w-3xl text-noxia-ash">Crée des séries et dramas suivis dans le temps : personnages, bible, épisodes, saisons et continuité narrative restent attachés à ta série.</p>
    <p className="mt-4 inline-block rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">Crédits disponibles : {profile?.credits ?? 0}</p>
    <section className="mt-8 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
      <h2 className="font-display text-xl text-noxia-silver">Nouvelle série</h2>
      <form action={async (fd: FormData) => { "use server"; await createSeriesAction(fd); }} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input name="title" required maxLength={120} placeholder="Titre de la série" className="min-h-12 rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 text-base text-noxia-silver" />
        <input name="genre" defaultValue="drama" maxLength={60} placeholder="Genre" className="min-h-12 rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 text-base text-noxia-silver" />
        <textarea name="synopsis" maxLength={4000} placeholder="Synopsis général" className="min-h-28 rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver sm:col-span-2" />
        <textarea name="bible" maxLength={12000} placeholder="Bible de continuité : monde, ton, règles, lieux, relations, éléments à ne jamais contredire…" className="min-h-36 rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver sm:col-span-2" />
        <label className="text-sm text-noxia-ash">Saisons<input name="seasons" type="number" min="1" max="20" defaultValue="1" className="mt-1 block min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-base text-noxia-silver" /></label>
        <label className="text-sm text-noxia-ash">Épisodes par saison<input name="episodes" type="number" min="1" max="50" defaultValue="8" className="mt-1 block min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-base text-noxia-silver" /></label>
        <button className="min-h-12 rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white sm:col-span-2">Créer la série</button>
      </form>
    </section>
    <section className="mt-8 space-y-5">
      {(series ?? []).map(s => {
        const eps = (episodes ?? []).filter(e => e.series_id === s.id);
        const chars = (characters ?? []).filter(c => c.series_id === s.id);
        return <article key={s.id} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-xl text-noxia-silver">{s.title}</h2><p className="mt-1 text-sm text-noxia-ash">{s.genre} · {s.seasons} saison(s) · {s.episodes_per_season} épisode(s)/saison</p></div><span className="rounded-sm border border-noxia-silver/15 px-3 py-1 text-xs text-noxia-ash">Continuité active</span></div>
          {s.synopsis && <p className="mt-3 text-sm text-noxia-ash">{s.synopsis}</p>}
          {chars.length > 0 && <p className="mt-3 text-xs text-noxia-ash">Personnages : {chars.map(c => c.name).join(" · ")}</p>}
          <div className="mt-5 rounded-sm border border-noxia-violet/20 bg-noxia-violet/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-sm font-medium text-noxia-silver">Planifier une saison avec NOXIA</h3><p className="mt-1 text-xs text-noxia-ash">Crée automatiquement les synopsis et notes de continuité des épisodes manquants. Les épisodes restent en brouillon jusqu’à leur génération vidéo.</p></div>
              <span className="text-xs text-noxia-ash">0 crédit (quota de messages)</span>
            </div>
            <form action={async (fd: FormData) => { "use server"; await planSeasonAction(fd); }} className="mt-3 grid gap-2 sm:grid-cols-[100px_120px_1fr_auto]">
              <input type="hidden" name="seriesId" value={s.id}/>
              <input name="season" type="number" min="1" max={s.seasons} defaultValue="1" aria-label="Saison à planifier" className="min-h-11 rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/>
              <input name="episodes" type="number" min="1" max={s.episodes_per_season} defaultValue={s.episodes_per_season} aria-label="Nombre d'épisodes" className="min-h-11 rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/>
              <input name="vision" maxLength={4000} placeholder="Vision de la saison (optionnel)" className="min-h-11 rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/>
              <button className="min-h-11 rounded-sm bg-noxia-violet px-4 text-xs font-medium text-white">Planifier</button>
            </form>
            <form action={async (fd: FormData) => { "use server"; await generateSeasonBatchAction(fd); }} className="mt-3 flex flex-wrap items-center gap-2 border-t border-noxia-silver/10 pt-3">
              <input type="hidden" name="seriesId" value={s.id}/>
              <label className="flex items-center gap-2 text-xs text-noxia-ash">Saison
                <select name="season" defaultValue="1" aria-label="Saison à générer" className="min-h-11 rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-xs text-noxia-silver">
                  {Array.from({ length: s.seasons }, (_, i) => <option key={i + 1} value={i + 1}>Saison {i + 1}</option>)}
                </select>
              </label>
              <button className="min-h-11 rounded-sm border border-noxia-violet/60 px-4 text-xs font-medium text-noxia-silver">Générer la saison par lots de 3</button>
              <span className="text-xs text-noxia-ash">NOXIA avance dans l’ordre et s’arrête si un épisode est encore en traitement.</span>
            </form>
          </div>
          <div className="mt-5 grid gap-3 rounded-sm border border-noxia-silver/10 p-4 sm:grid-cols-2">
            <form action={async (fd: FormData) => { "use server"; await addCharacterAction(fd); }} className="space-y-2">
              <input type="hidden" name="seriesId" value={s.id}/>
              <h3 className="text-sm font-medium text-noxia-silver">Ajouter un personnage</h3>
              <input name="name" required maxLength={80} placeholder="Nom" className="min-h-10 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/>
              <input name="description" maxLength={3000} placeholder="Description" className="min-h-10 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/>
              <input name="traits" maxLength={2000} placeholder="Traits / relations" className="min-h-10 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/>
              <button className="min-h-10 rounded-sm border border-noxia-violet/60 px-4 text-xs text-noxia-silver">Ajouter</button>
            </form>
            <form action={async (fd: FormData) => { "use server"; await addEpisodeAction(fd); }} className="space-y-2">
              <input type="hidden" name="seriesId" value={s.id}/>
              <h3 className="text-sm font-medium text-noxia-silver">Ajouter un épisode</h3>
              <div className="grid grid-cols-2 gap-2"><input name="season" type="number" min="1" max="20" defaultValue="1" aria-label="Saison" className="min-h-10 rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/><input name="episode" type="number" min="1" max="50" defaultValue={eps.length + 1} aria-label="Épisode" className="min-h-10 rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/></div>
              <input name="title" required maxLength={160} placeholder="Titre de l'épisode" className="min-h-10 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver"/>
              <textarea name="synopsis" maxLength={4000} placeholder="Synopsis" className="min-h-20 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 py-2 text-sm text-noxia-silver"/>
              <textarea name="continuity" maxLength={6000} placeholder="Notes de continuité" className="min-h-20 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 py-2 text-sm text-noxia-silver"/>
              <button className="min-h-10 rounded-sm border border-noxia-violet/60 px-4 text-xs text-noxia-silver">Ajouter l'épisode</button>
            </form>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {eps.map(e => <div key={e.id} className="rounded-sm border border-noxia-silver/10 p-4"><div className="flex justify-between gap-2"><h3 className="text-sm font-medium text-noxia-silver">S{e.season_number}E{e.episode_number} — {e.title}</h3><span className="text-xs text-noxia-ash">{e.status}</span></div>{e.synopsis && <p className="mt-2 text-xs text-noxia-ash">{e.synopsis}</p>}<div className="mt-3 flex flex-wrap gap-2"><form action={async (fd: FormData) => { "use server"; await generateSeriesEpisodeAction(fd); }}><input type="hidden" name="seriesId" value={s.id}/><input type="hidden" name="episodeId" value={e.id}/><button className="min-h-11 rounded-sm border border-noxia-violet/60 px-4 text-xs text-noxia-silver hover:border-noxia-violet">Générer l'épisode</button></form>{e.status === "processing" && <form action={async (fd: FormData) => { "use server"; await refreshSeriesEpisodeAction(fd); }}><input type="hidden" name="seriesId" value={s.id}/><input type="hidden" name="episodeId" value={e.id}/><button className="min-h-11 rounded-sm border border-noxia-silver/25 px-4 text-xs text-noxia-silver">Actualiser</button></form>}</div></div>)}
            {eps.length === 0 && <p className="text-sm text-noxia-ash">Aucun épisode créé. Les épisodes peuvent être ajoutés par l'étape suivante du générateur de série.</p>}
          </div>
        </article>;
      })}
      {(series ?? []).length === 0 && <p className="rounded-md border border-noxia-silver/15 p-5 text-sm text-noxia-ash">Aucune série pour le moment.</p>}
    </section>
  </main>;
}
