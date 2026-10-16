"use client";
import { InsufficientCreditsNotice } from "@/components/credits/InsufficientCreditsNotice";
import { useActionState, useState } from "react";
import { generateMusicAction } from "@/app/dashboard/music/actions";
import { MUSIC_DURATIONS, MUSIC_FORMATS, MUSIC_MOODS, MUSIC_STYLES } from "@/lib/ai/music/types";
import { DURATION_LABELS, FORMAT_LABELS, MOOD_LABELS, STYLE_LABELS, SUGGESTIONS } from "@/modules/music/options";
import { NOT_CONFIGURED_MESSAGE, PROMPT_MAX } from "@/modules/music/config";
import { SelectField } from "@/components/ui/SelectField";
import { toOptions } from "@/lib/form-options";
import type { MusicDisplay, MusicActionState } from "@/modules/music/types";

export function MusicWorkspace({ credits, engineReady, history }: { credits: number; engineReady: boolean; history: MusicDisplay[] }) {
  const [state, formAction, pending] = useActionState<MusicActionState, FormData>(generateMusicAction, { status: "idle" });
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("cinematic"); const [mood, setMood] = useState("epic"); const [duration, setDuration] = useState("30"); const [format, setFormat] = useState("mp3");
  const [instrumental, setInstrumental] = useState(true); const [bpm, setBpm] = useState(""); const [instruments, setInstruments] = useState("");
  const current = state.status === "success" ? state.display : history[0] ?? null;
  return <div className="space-y-6">
    {!engineReady && <p role="status" className="rounded-sm border border-amber-500/40 p-3 text-sm text-amber-400">{NOT_CONFIGURED_MESSAGE}</p>}
    <form action={formAction} className="space-y-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
      <div className="flex flex-wrap gap-2">{SUGGESTIONS.map(s => <button key={s} type="button" onClick={() => setPrompt(s)} className="min-h-11 rounded-sm border border-noxia-silver/25 px-3 text-left text-sm text-noxia-silver hover:border-noxia-violet">{s}</button>)}</div>
      <textarea name="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} maxLength={PROMPT_MAX} required placeholder="Décris précisément la musique : style, ambiance, instruments, scène, émotion…" className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Style" name="style" value={style} onChange={setStyle} options={toOptions(MUSIC_STYLES, STYLE_LABELS)} />
        <SelectField label="Ambiance" name="mood" value={mood} onChange={setMood} options={toOptions(MUSIC_MOODS, MOOD_LABELS)} />
        <SelectField label="Durée" name="duration" value={duration} onChange={setDuration} options={toOptions(MUSIC_DURATIONS, DURATION_LABELS)} />
        <SelectField label="Format" name="format" value={format} onChange={setFormat} options={toOptions(MUSIC_FORMATS, FORMAT_LABELS)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-noxia-ash">BPM (optionnel)<input name="bpm" inputMode="numeric" value={bpm} onChange={e => setBpm(e.target.value)} placeholder="40–220" className="mt-1 min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-base text-noxia-silver" /></label>
        <label className="block text-sm text-noxia-ash">Instruments<input name="instruments" value={instruments} onChange={e => setInstruments(e.target.value)} placeholder="Piano, guitare, percussions…" className="mt-1 min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-base text-noxia-silver" /></label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-noxia-silver"><input type="checkbox" name="instrumental" checked={instrumental} onChange={e => setInstrumental(e.target.checked)} /> Instrumental uniquement</label>
      {state.status === "insufficient_credits" ? <InsufficientCreditsNotice message={state.message} /> : state.status !== "idle" && state.status !== "success" && <p role="alert" className="text-sm text-amber-400">{state.message}</p>}
      <button disabled={pending || !engineReady} className="min-h-12 rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white disabled:opacity-60">{pending ? "Génération…" : "Générer la musique"}</button>
      <p className="text-xs text-noxia-ash">Crédits disponibles : {credits}</p>
    </form>
    <section className="rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
      <h2 className="mb-3 font-display text-xl text-noxia-silver">Résultat</h2>
      {!current && <p className="text-sm text-noxia-ash">Le résultat musical apparaîtra ici.</p>}
      {current?.result?.asset && <audio controls src={current.result.asset.storedUrl ?? current.result.asset.url} className="w-full" />}
      {current?.result?.asset && <a href={`${current.result.asset.storedUrl ?? current.result.asset.url}&download=1`} className="mt-3 inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver">Télécharger</a>}
    </section>
  </div>;
}
