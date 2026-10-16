"use client";
import { InsufficientCreditsNotice } from "@/components/credits/InsufficientCreditsNotice";
import { useActionState, useState } from "react";
import { generateVideoAction } from "@/app/dashboard/video/actions";
import { VIDEO_STYLES, VIDEO_DURATIONS, VIDEO_FORMATS, VIDEO_QUALITIES, VIDEO_CAMERAS, VIDEO_MOTIONS } from "@/lib/ai/video/types";
import { STYLE_LABELS, DURATION_LABELS, FORMAT_LABELS, QUALITY_LABELS, CAMERA_LABELS, MOTION_LABELS, SUGGESTIONS } from "@/modules/video/options";
import { PROMPT_MAX, NOT_CONFIGURED_MESSAGE } from "@/modules/video/config";
import type { VideoActionState, VideoDisplay } from "@/modules/video/types";
import { SelectField } from "@/components/ui/SelectField";
import { SensitiveContentNotice } from "@/components/ui/SensitiveContentNotice";
import { toOptions } from "@/lib/form-options";
import { VideoResultPanel } from "./VideoResultPanel";
import { VideoHistory } from "./VideoHistory";

function Composer({ credits, engineReady, viewing, onNew, canUnwatermarkedVideo }: { credits: number; engineReady: boolean; viewing: VideoDisplay | null; onNew: () => void; canUnwatermarkedVideo: boolean }) {
  const [state, formAction, pending] = useActionState<VideoActionState, FormData>(generateVideoAction, { status: "idle" });
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [duration, setDuration] = useState("10");
  const [format, setFormat] = useState("horizontal");
  const [quality, setQuality] = useState("hd");
  const [camera, setCamera] = useState("cinematic");
  const [motion, setMotion] = useState("normal");
  const shown = viewing ?? (state.status === "success" ? state.display : null);

  return (
    <div className="space-y-6">
      {!engineReady && <p role="status" className="rounded-sm border border-amber-500/40 p-3 text-sm text-amber-400">{NOT_CONFIGURED_MESSAGE}</p>}
      <SensitiveContentNotice />
      <form action={formAction} className="space-y-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} type="button" onClick={() => setPrompt(s)} className="min-h-11 rounded-sm border border-noxia-silver/25 px-3 text-left text-sm text-noxia-silver hover:border-noxia-violet">{s}</button>
          ))}
        </div>
        <textarea name="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} maxLength={PROMPT_MAX} required
          placeholder="Décris ta vidéo : sujet, décor, lumière, action, ambiance…"
          className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet" />
        <details className="rounded-sm border border-noxia-silver/15 px-4">
          <summary className="flex min-h-11 cursor-pointer select-none items-center text-sm text-noxia-silver">Options</summary>
          <div className="grid gap-3 pb-4 pt-1 sm:grid-cols-2">
          <SelectField label="Style" name="style" value={style} onChange={setStyle} options={toOptions(VIDEO_STYLES, STYLE_LABELS)} />
          <SelectField label="Durée" name="duration" value={duration} onChange={setDuration} options={toOptions(VIDEO_DURATIONS, DURATION_LABELS)} />
          <SelectField label="Format" name="format" value={format} onChange={setFormat} options={toOptions(VIDEO_FORMATS, FORMAT_LABELS)} />
          <SelectField label="Qualité" name="quality" value={quality} onChange={setQuality} options={toOptions(VIDEO_QUALITIES, QUALITY_LABELS)} />
          <SelectField label="Caméra" name="camera" value={camera} onChange={setCamera} options={toOptions(VIDEO_CAMERAS, CAMERA_LABELS)} />
          <SelectField label="Mouvement" name="motion" value={motion} onChange={setMotion} options={toOptions(VIDEO_MOTIONS, MOTION_LABELS)} />
          </div>
        </details>
        {state.status !== "idle" && state.status !== "success" && (
          state.status === "insufficient_credits" ? <InsufficientCreditsNotice message={state.message} /> : <p role="alert" className={`text-sm ${state.status === "not_configured" || state.status === "processing" ? "text-amber-400" : "text-noxia-violet"}`}>{state.message}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button disabled={pending} className="min-h-12 rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">{pending ? "Génération…" : "Générer"}</button>
          <button type="button" onClick={onNew} className="min-h-12 rounded-sm border border-noxia-silver/30 px-6 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Nouveau</button>
        </div>
        <p className="text-xs text-noxia-ash">Crédits disponibles : {credits}</p>
      </form>
      <section id="video-result" className="min-w-0 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
        <h2 className="mb-3 font-display text-xl text-noxia-silver">Résultat</h2>
        <VideoResultPanel item={shown} canUnwatermarkedVideo={canUnwatermarkedVideo} />
      </section>
    </div>
  );
}

export function VideoWorkspace({ credits, engineReady, history, historyError, canUnwatermarkedVideo }: { credits: number; engineReady: boolean; history: VideoDisplay[]; historyError: boolean; canUnwatermarkedVideo: boolean }) {
  const [runKey, setRunKey] = useState(0);
  const [viewing, setViewing] = useState<VideoDisplay | null>(null);
  return (
    <>
      <Composer key={runKey} credits={credits} engineReady={engineReady} viewing={viewing} canUnwatermarkedVideo={canUnwatermarkedVideo} onNew={() => { setViewing(null); setRunKey(k => k + 1); }} />
      <VideoHistory items={history} error={historyError} activeId={viewing?.id}
        onSelect={i => { setViewing(i); setTimeout(() => document.getElementById("video-result")?.scrollIntoView({ behavior: "smooth" }), 0); }} />
    </>
  );
}
