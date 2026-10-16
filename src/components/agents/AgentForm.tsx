"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveAgentAction } from "@/app/dashboard/agents/actions";
import { PERSONALITIES, CREATIVITIES, LANGUAGES, AGENT_STATUSES, AGENT_ICONS } from "@/lib/ai/agents/types";
import { PERSONALITY_LABELS, CREATIVITY_LABELS, LANGUAGE_LABELS, AGENT_STATUS_LABELS } from "@/modules/agents/options";
import { LIMITS } from "@/modules/agents/config";
import { AGENT_TEMPLATES } from "@/modules/agents/templates";
import { SelectField } from "@/components/ui/SelectField";
import { toOptions } from "@/lib/form-options";
import type { AgentFormState } from "@/modules/agents/types";

export interface AgentFormInitial { id?: string; name?: string; description?: string; icon?: string; objective?: string; role?: string; instructions?: string; domain?: string; personality?: string; personalityCustom?: string; creativity?: string; language?: string; status?: string }
const cls = "w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet";
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block text-sm text-noxia-ash">{label}<div className="mt-1">{children}</div></label>;

export function AgentForm({ initial = {}, providers }: { initial?: AgentFormInitial; providers: string[] }) {
  const [state, formAction, pending] = useActionState<AgentFormState, FormData>(saveAgentAction, { status: "idle" });
  const [v, setV] = useState({ name: "", description: "", icon: "🤖", objective: "", role: "", instructions: "", domain: "", personality: "professional", personalityCustom: "", creativity: "medium", language: "fr", status: "active", ...initial });
  const set = (k: keyof typeof v) => (val: string) => setV(s => ({ ...s, [k]: val }));
  const text = (k: keyof typeof v) => ({ name: k, value: v[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.target.value), className: cls });
  return (
    <form action={formAction} className="space-y-4 rounded-md border border-noxia-silver/15 bg-noxia-night p-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {!initial.id && (
        <div>
          <p className="text-sm text-noxia-ash">Partir d'un modèle (simple point de départ, pas un agent fonctionnel) :</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AGENT_TEMPLATES.map(t => (
              <button key={t.id} type="button" className="min-h-11 rounded-sm border border-noxia-silver/25 px-3 text-sm text-noxia-silver hover:border-noxia-violet"
                onClick={() => setV(s => ({ ...s, name: t.name, icon: t.icon in AGENT_ICON_SET ? t.icon : s.icon, description: t.description, objective: t.description, role: t.role, instructions: t.instructions, domain: t.domain, personality: t.personality, creativity: t.creativity }))}>{t.icon} {t.name}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-sm text-noxia-ash">Avatar</p>
        <input type="hidden" name="icon" value={v.icon} />
        <div className="mt-1 flex flex-wrap gap-2">
          {AGENT_ICONS.map(i => (
            <button key={i} type="button" aria-pressed={v.icon === i} aria-label={`Icône ${i}`} onClick={() => set("icon")(i)}
              className={`h-12 w-12 rounded-sm border text-2xl ${v.icon === i ? "border-noxia-violet bg-noxia-violet/20" : "border-noxia-silver/20"}`}>{i}</button>
          ))}
        </div>
      </div>
      <Field label="Nom de l'agent"><input {...text("name")} required maxLength={LIMITS.name.max} /></Field>
      <Field label="Description"><textarea {...text("description")} rows={2} maxLength={LIMITS.description} /></Field>
      <Field label="Objectif"><textarea {...text("objective")} rows={2} maxLength={LIMITS.objective} placeholder="Ce que l'agent doit accomplir pour toi." /></Field>
      <Field label="Rôle"><input {...text("role")} required maxLength={LIMITS.role.max} placeholder="Ex. : Développeur Full Stack" /></Field>
      <Field label="Instructions système"><textarea {...text("instructions")} required rows={8} maxLength={LIMITS.instructions.max} placeholder="Explique à l'agent comment se comporter et ce qu'il doit faire." /></Field>
      <Field label="Domaine d'expertise"><input {...text("domain")} maxLength={LIMITS.domain} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Personnalité" name="personality" value={v.personality} onChange={set("personality")} options={toOptions(PERSONALITIES, PERSONALITY_LABELS)} />
        <SelectField label="Créativité" name="creativity" value={v.creativity} onChange={set("creativity")} options={toOptions(CREATIVITIES, CREATIVITY_LABELS)} />
        <SelectField label="Langue" name="language" value={v.language} onChange={set("language")} options={toOptions(LANGUAGES, LANGUAGE_LABELS)} />
        <SelectField label="Statut" name="status" value={v.status} onChange={set("status")} options={toOptions(AGENT_STATUSES, AGENT_STATUS_LABELS)} />
      </div>
      <Field label="Personnalisation libre de la personnalité (optionnel)"><textarea {...text("personalityCustom")} rows={2} maxLength={LIMITS.personalityCustom} /></Field>

      {state.status === "error" && <p role="alert" className="text-sm text-noxia-violet">{state.message}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button disabled={pending} className="min-h-12 rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">{pending ? "Enregistrement…" : "Enregistrer"}</button>
        <Link href={initial.id ? `/dashboard/agents/${initial.id}` : "/dashboard/agents"} className="inline-flex min-h-12 items-center justify-center rounded-sm border border-noxia-silver/30 px-6 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">Annuler</Link>
      </div>
    </form>
  );
}
const AGENT_ICON_SET: Record<string, true> = Object.fromEntries(AGENT_ICONS.map(i => [i, true]));
