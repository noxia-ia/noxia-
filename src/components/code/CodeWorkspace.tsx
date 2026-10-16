"use client";
import { InsufficientCreditsNotice } from "@/components/credits/InsufficientCreditsNotice";
import { useActionState, useState } from "react";
import { generateCodeAction } from "@/app/dashboard/code/actions";
import { PROJECT_TYPES, TECHNOLOGIES, type ProjectType, type Technology } from "@/lib/ai/types";
import { PROJECT_LABELS, TECH_LABELS, SUGGESTIONS } from "@/modules/code/options";
import { PROMPT_MAX, NOT_CONFIGURED_MESSAGE } from "@/modules/code/config";
import type { CodeActionState, HistoryItem } from "@/modules/code/types";
import { ResultPanel } from "./ResultPanel";
import { HistoryList } from "./HistoryList";

const field = "w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet";

function Composer({ credits, engineReady, viewing, onNew }: { credits: number; engineReady: boolean; viewing: HistoryItem | null; onNew: () => void }) {
  const [state, formAction, pending] = useActionState<CodeActionState, FormData>(generateCodeAction, { status: "idle" });
  const [prompt, setPrompt] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("fullstack");
  const [technology, setTechnology] = useState<Technology>("nextjs");
  const shown = viewing?.result ?? (state.status === "success" ? state.result : null);
  const shownKey = viewing?.id ?? (state.status === "success" ? state.generationId : "none");

  return (
    <div className="space-y-6">
      {!engineReady && <p role="status" className="rounded-sm border border-amber-500/40 p-3 text-sm text-amber-400">{NOT_CONFIGURED_MESSAGE}</p>}
      <form action={formAction} className="space-y-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s.label} type="button" onClick={() => { setPrompt(s.prompt); setProjectType(s.projectType); }}
              className="min-h-11 rounded-sm border border-noxia-silver/25 px-3 text-sm text-noxia-silver hover:border-noxia-violet">{s.label}</button>
          ))}
        </div>
        <textarea name="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={7} maxLength={PROMPT_MAX} required
          placeholder="Ex. : Crée une application full stack avec Supabase." className={field} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-noxia-ash">Projet
            <select name="projectType" value={projectType} onChange={e => setProjectType(e.target.value as ProjectType)} className={`${field} mt-1`}>
              {PROJECT_TYPES.map(p => <option key={p} value={p}>{PROJECT_LABELS[p]}</option>)}
            </select></label>
          <label className="block text-sm text-noxia-ash">Technologie
            <select name="technology" value={technology} onChange={e => setTechnology(e.target.value as Technology)} className={`${field} mt-1`}>
              {TECHNOLOGIES.map(t => <option key={t} value={t}>{TECH_LABELS[t]}</option>)}
            </select></label>
        </div>
        {state.status !== "idle" && state.status !== "success" && (
          state.status === "insufficient_credits" ? <InsufficientCreditsNotice message={state.message} /> : <p role="alert" className={`text-sm ${state.status === "not_configured" ? "text-amber-400" : "text-noxia-violet"}`}>{state.message}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button disabled={pending} className="min-h-12 rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">{pending ? "Génération…" : "Générer"}</button>
          <button type="button" onClick={onNew} className="min-h-12 rounded-sm border border-noxia-silver/30 px-6 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Nouveau projet</button>
        </div>
        <p className="text-xs text-noxia-ash">Crédits disponibles : {credits}</p>
      </form>
      <section id="code-result" className="min-w-0 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
        <h2 className="mb-3 font-display text-xl text-noxia-silver">Résultat</h2>
        <ResultPanel key={shownKey} result={shown} />
      </section>
    </div>
  );
}

export function CodeWorkspace({ credits, engineReady, history, historyError }: { credits: number; engineReady: boolean; history: HistoryItem[]; historyError: boolean }) {
  const [runKey, setRunKey] = useState(0);
  const [viewing, setViewing] = useState<HistoryItem | null>(null);
  return (
    <>
      <Composer key={runKey} credits={credits} engineReady={engineReady} viewing={viewing} onNew={() => { setViewing(null); setRunKey(k => k + 1); }} />
      <HistoryList items={history} error={historyError} activeId={viewing?.id}
        onSelect={i => { setViewing(i); setTimeout(() => document.getElementById("code-result")?.scrollIntoView({ behavior: "smooth" }), 0); }} />
    </>
  );
}
