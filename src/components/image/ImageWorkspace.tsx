"use client";
import { InsufficientCreditsNotice } from "@/components/credits/InsufficientCreditsNotice";
import { useActionState, useState } from "react";
import { generateImageAction } from "@/app/dashboard/image/actions";
import { IMAGE_STYLES, IMAGE_RATIOS, IMAGE_QUALITIES, IMAGE_COUNTS, IMAGE_FORMATS, type ImageCount } from "@/lib/ai/image/types";
import { STYLE_LABELS, RATIO_LABELS, QUALITY_LABELS, COUNT_LABELS, FORMAT_LABELS, SUGGESTIONS } from "@/modules/image/options";
import { PROMPT_MAX, NOT_CONFIGURED_MESSAGE, imageCost } from "@/modules/image/config";
import type { ImageActionState, ImageDisplay } from "@/modules/image/types";
import { SelectField } from "@/components/ui/SelectField";
import { SensitiveContentNotice } from "@/components/ui/SensitiveContentNotice";
import { toOptions } from "@/lib/form-options";
import { ImageResultPanel } from "./ImageResultPanel";
import { ImageHistory } from "./ImageHistory";

function Composer({ credits, engineReady, viewing, onNew }: { credits: number; engineReady: boolean; viewing: ImageDisplay | null; onNew: () => void }) {
  const [state, formAction, pending] = useActionState<ImageActionState, FormData>(generateImageAction, { status: "idle" });
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [ratio, setRatio] = useState("1:1");
  const [quality, setQuality] = useState("hd");
  const [count, setCount] = useState("1");
  const [format, setFormat] = useState("png");
  const shown = viewing ?? (state.status === "success" ? state.display : null);
  const estimate = imageCost(Number(count) as ImageCount); // affichage seulement : le serveur recalcule le coût

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
          placeholder="Décris ton image : sujet, décor, lumière, ambiance, détails…"
          className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet" />
        <details className="rounded-sm border border-noxia-silver/15 px-4">
          <summary className="flex min-h-11 cursor-pointer select-none items-center text-sm text-noxia-silver">Options</summary>
          <div className="grid gap-3 pb-4 pt-1 sm:grid-cols-2">
          <SelectField label="Style" name="style" value={style} onChange={setStyle} options={toOptions(IMAGE_STYLES, STYLE_LABELS)} />
          <SelectField label="Ratio" name="ratio" value={ratio} onChange={setRatio} options={toOptions(IMAGE_RATIOS, RATIO_LABELS)} />
          <SelectField label="Qualité" name="quality" value={quality} onChange={setQuality} options={toOptions(IMAGE_QUALITIES, QUALITY_LABELS)} />
          <SelectField label="Nombre d'images" name="count" value={count} onChange={setCount} options={toOptions(IMAGE_COUNTS, COUNT_LABELS)} />
          <SelectField label="Format de fichier" name="format" value={format} onChange={setFormat} options={toOptions(IMAGE_FORMATS, FORMAT_LABELS)} />
          </div>
        </details>
        {state.status !== "idle" && state.status !== "success" && (
          state.status === "insufficient_credits" ? <InsufficientCreditsNotice message={state.message} /> : <p role="alert" className={`text-sm ${state.status === "not_configured" || state.status === "processing" ? "text-amber-400" : "text-noxia-violet"}`}>{state.message}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button disabled={pending} className="min-h-12 rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">{pending ? "Génération…" : "Générer"}</button>
          <button type="button" onClick={onNew} className="min-h-12 rounded-sm border border-noxia-silver/30 px-6 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Nouveau</button>
        </div>
        <p className="text-xs text-noxia-ash">Crédits disponibles : {credits} · Coût estimé : {estimate} crédit(s), débité uniquement si l'image est générée.</p>
      </form>
      <section id="image-result" className="min-w-0 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
        <h2 className="mb-3 font-display text-xl text-noxia-silver">Résultat</h2>
        <ImageResultPanel item={shown} />
      </section>
    </div>
  );
}

export function ImageWorkspace({ credits, engineReady, history, historyError }: { credits: number; engineReady: boolean; history: ImageDisplay[]; historyError: boolean }) {
  const [runKey, setRunKey] = useState(0);
  const [viewing, setViewing] = useState<ImageDisplay | null>(null);
  return (
    <>
      <Composer key={runKey} credits={credits} engineReady={engineReady} viewing={viewing} onNew={() => { setViewing(null); setRunKey(k => k + 1); }} />
      <ImageHistory items={history} error={historyError} activeId={viewing?.id}
        onSelect={i => { setViewing(i); setTimeout(() => document.getElementById("image-result")?.scrollIntoView({ behavior: "smooth" }), 0); }} />
    </>
  );
}
