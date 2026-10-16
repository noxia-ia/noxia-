"use client";
import { InsufficientCreditsNotice } from "@/components/credits/InsufficientCreditsNotice";
import { useActionState, useState } from "react";
import { generateASMRAction } from "@/app/dashboard/asmr/actions";
import { ASMR_STYLES, ASMR_AMBIANCES, ASMR_DURATIONS, ASMR_FORMATS } from "@/lib/ai/asmr/types";
import { STYLE_LABELS, AMBIANCE_LABELS, DURATION_LABELS, FORMAT_LABELS, SUGGESTIONS } from "@/modules/asmr/options";
import { PROMPT_MAX, NOT_CONFIGURED_MESSAGE } from "@/modules/asmr/config";
import type { ASMRActionState, ASMRDisplay } from "@/modules/asmr/types";
import { SelectField } from "@/components/ui/SelectField";
import { SensitiveContentNotice } from "@/components/ui/SensitiveContentNotice";
import { toOptions } from "@/lib/form-options";
import { ASMRResultPanel } from "./ASMRResultPanel";
import { ASMRHistory } from "./ASMRHistory";


function Composer({ credits, engineReady, viewing, onNew }: { credits: number; engineReady: boolean; viewing: ASMRDisplay | null; onNew: () => void }) {
  const [state, formAction, pending] = useActionState<ASMRActionState, FormData>(generateASMRAction, { status: "idle" });
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<"video" | "audio">("video");
  const [style, setStyle] = useState("satisfying");
  const [ambiance, setAmbiance] = useState("studio");
  const [duration, setDuration] = useState("10");
  const [format, setFormat] = useState("vertical");
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
          placeholder="Décris précisément la scène ASMR : objets, gestes, matières, sons…"
          className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet" />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Type" name="type" value={type} onChange={v => setType(v === "audio" ? "audio" : "video")} options={[{ value: "video", label: "Vidéo ASMR" }, { value: "audio", label: "Audio ASMR" }]} />
          <SelectField label="Style sonore" name="style" value={style} onChange={setStyle} options={toOptions(ASMR_STYLES, STYLE_LABELS)} />
          <SelectField label="Ambiance" name="ambiance" value={ambiance} onChange={setAmbiance} options={toOptions(ASMR_AMBIANCES, AMBIANCE_LABELS)} />
          <SelectField label="Durée" name="duration" value={duration} onChange={setDuration} options={toOptions(ASMR_DURATIONS, DURATION_LABELS)} />
          {type === "video" ? <SelectField label="Format" name="format" value={format} onChange={setFormat} options={toOptions(ASMR_FORMATS, FORMAT_LABELS)} /> : <input type="hidden" name="format" value={format} />}
        </div>
        {state.status !== "idle" && state.status !== "success" && (
          state.status === "insufficient_credits" ? <InsufficientCreditsNotice message={state.message} /> : <p role="alert" className={`text-sm ${state.status === "not_configured" || state.status === "processing" ? "text-amber-400" : "text-noxia-violet"}`}>{state.message}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button disabled={pending} className="min-h-12 rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">{pending ? "Génération…" : "Générer"}</button>
          <button type="button" onClick={onNew} className="min-h-12 rounded-sm border border-noxia-silver/30 px-6 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Nouveau</button>
        </div>
        <p className="text-xs text-noxia-ash">Crédits disponibles : {credits}</p>
      </form>
      <section id="asmr-result" className="min-w-0 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
        <h2 className="mb-3 font-display text-xl text-noxia-silver">Résultat</h2>
        <ASMRResultPanel item={shown} />
      </section>
    </div>
  );
}

export function ASMRWorkspace({ credits, engineReady, history, historyError }: { credits: number; engineReady: boolean; history: ASMRDisplay[]; historyError: boolean }) {
  const [runKey, setRunKey] = useState(0);
  const [viewing, setViewing] = useState<ASMRDisplay | null>(null);
  return (
    <>
      <Composer key={runKey} credits={credits} engineReady={engineReady} viewing={viewing} onNew={() => { setViewing(null); setRunKey(k => k + 1); }} />
      <ASMRHistory items={history} error={historyError} activeId={viewing?.id}
        onSelect={i => { setViewing(i); setTimeout(() => document.getElementById("asmr-result")?.scrollIntoView({ behavior: "smooth" }), 0); }} />
    </>
  );
}
