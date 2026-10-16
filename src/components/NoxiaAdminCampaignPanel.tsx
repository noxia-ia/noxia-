"use client";
import { useMemo, useState } from "react";
import { CAMPAIGN_LIMITS, validateCampaign } from "@/lib/admin/campaign-types";
import type { CampaignConfig, CampaignProvider, CampaignStatus } from "@/lib/admin/campaign-types";

export type AdminResult = { ok: true } | { ok: false; error: string };
type Props = {
  initialCampaigns?: CampaignConfig[];
  onSave: (campaign: CampaignConfig) => Promise<AdminResult>;
  onStatusChange: (id: string, status: CampaignStatus) => Promise<AdminResult>;
};

const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const fromLocalInput = (v: string) => (v ? new Date(v + "Z").toISOString() : null);
const field = "mt-1 w-full rounded-lg bg-white/5 p-2 text-base";

export function NoxiaAdminCampaignPanel({ initialCampaigns = [], onSave, onStatusChange }: Props) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [persisted, setPersisted] = useState(() => new Set(initialCampaigns.map((c) => c.id)));
  const [selected, setSelected] = useState<CampaignConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const errors = useMemo(() => (selected ? validateCampaign(selected) : []), [selected]);
  const isNew = selected ? !persisted.has(selected.id) : false;

  function newCampaign() {
    setFeedback(null);
    setSelected({
      id: crypto.randomUUID(), name: "Nouvelle campagne", provider: "other", videoUrl: "", action: "visit", targetUrl: "",
      durationSeconds: 30, rewardCredits: 2, maxRewards: null, startsAt: new Date().toISOString(), endsAt: null, status: "draft",
    });
  }

  async function save() {
    if (!selected || errors.length) return;
    setBusy(true); setFeedback(null);
    try {
      const r = await onSave(selected);
      if (!r.ok) { setFeedback({ kind: "err", text: r.error }); return; }
      setPersisted((p) => new Set(p).add(selected.id));
      setCampaigns((items) => items.some((x) => x.id === selected.id) ? items.map((x) => (x.id === selected.id ? selected : x)) : [...items, selected]);
      setFeedback({ kind: "ok", text: "Campagne enregistrée." });
    } finally { setBusy(false); }
  }

  async function changeStatus(status: CampaignStatus) {
    if (!selected || isNew) return;
    setBusy(true); setFeedback(null);
    try {
      const r = await onStatusChange(selected.id, status);
      if (!r.ok) { setFeedback({ kind: "err", text: r.error }); return; }
      const next = { ...selected, status };
      setSelected(next);
      setCampaigns((items) => items.map((x) => (x.id === next.id ? next : x)));
      setFeedback({ kind: "ok", text: `Statut : ${status}.` });
    } finally { setBusy(false); }
  }

  const set = <K extends keyof CampaignConfig>(k: K, v: CampaignConfig[K]) => selected && setSelected({ ...selected, [k]: v });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 text-white">
        <div className="mb-4 flex items-center justify-between">
          <div><p className="text-xs uppercase tracking-[0.2em] text-violet-300">NOXIA Admin</p><h2 className="text-xl font-semibold">Campagnes</h2></div>
          <button onClick={newCampaign} className="min-h-11 rounded-xl bg-violet-600 px-4 py-2 text-sm">+ Nouvelle</button>
        </div>
        <div className="space-y-2">
          {campaigns.map((c) => (
            <button key={c.id} onClick={() => { setSelected(c); setFeedback(null); }} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-white/10 p-3 text-left hover:bg-white/5">
              <span><strong className="block">{c.name}</strong><small className="text-slate-400">{c.provider} · +2 crédits</small></span>
              <span className="text-xs text-slate-300">{c.status}</span>
            </button>
          ))}
          {!campaigns.length && <p className="text-sm text-slate-400">Aucune campagne configurée.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 text-white">
        {!selected ? <p className="text-slate-400">Sélectionne une campagne ou crée-en une.</p> : (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configuration {isNew && <span className="text-xs text-violet-300">(non enregistrée)</span>}</h3>
            <label className="block text-sm">Nom<input className={field} value={selected.name} onChange={(e) => set("name", e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Plateforme
                <select className={field} value={selected.provider} onChange={(e) => set("provider", e.target.value as CampaignProvider)}>
                  <option value="tiktok">TikTok</option><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="other">Autre / test interne</option>
                </select>
              </label>
              <label className="text-sm">Récompense
                <input className={field} value="+2 crédits · visionnage complet" readOnly aria-label="Récompense publicitaire" />
              </label>
            </div>
            <label className="block text-sm">URL de la vidéo (https)<input className={field} inputMode="url" value={selected.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} /></label>
            <label className="block text-sm">Lien de destination (optionnel pour l’utilisateur)<input className={field} inputMode="url" value={selected.targetUrl} onChange={(e) => set("targetUrl", e.target.value)} /></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm">Durée (s)<input type="number" min={CAMPAIGN_LIMITS.minDuration} max={CAMPAIGN_LIMITS.maxDuration} className={field} value={selected.durationSeconds} onChange={(e) => set("durationSeconds", Number(e.target.value))} /></label>
              <label className="text-sm">Plafond<input type="number" min={1} placeholder="illimité" className={field} value={selected.maxRewards ?? ""} onChange={(e) => set("maxRewards", e.target.value === "" ? null : Number(e.target.value))} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Début (UTC)<input type="datetime-local" className={field} value={toLocalInput(selected.startsAt)} onChange={(e) => set("startsAt", fromLocalInput(e.target.value))} /></label>
              <label className="text-sm">Fin (UTC)<input type="datetime-local" className={field} value={toLocalInput(selected.endsAt)} onChange={(e) => set("endsAt", fromLocalInput(e.target.value))} /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || !!errors.length} onClick={save} className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
              {(["draft", "active", "paused", "ended"] as CampaignStatus[]).map((s) => (
                <button key={s} disabled={busy || isNew} onClick={() => changeStatus(s)} className={`min-h-11 rounded-xl border px-3 py-2 text-xs disabled:opacity-40 ${selected.status === s ? "border-violet-400 bg-violet-500/20" : "border-white/10"}`}>{s}</button>
              ))}
            </div>
            {isNew && <p className="text-xs text-slate-400">Enregistre d’abord la campagne (brouillon) avant de changer son statut.</p>}
            {!!errors.length && <p className="text-sm text-rose-300">À corriger : {errors.join(", ")}</p>}
            {feedback && <p role="status" className={`text-sm ${feedback.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{feedback.text}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
