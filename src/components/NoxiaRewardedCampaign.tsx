"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/dashboard/rewards/actions";

export interface RewardedCampaignData {
  id: string;
  title: string;
  platform: string;
  videoUrl: string;
  destinationUrl: string;
  durationSeconds: number;
  rewardCredits: number;
  /** Legacy campaign metadata; Phase 1 reward does not require a social action. */
  actionLabel?: string;
}

type Props = {
  campaign: RewardedCampaignData;
  alreadyRewarded?: boolean;
  start: (campaignId: string) => Promise<ActionState>;
  heartbeat: (campaignId: string) => Promise<ActionState>;
  complete: (campaignId: string) => Promise<ActionState>;
  claim: (campaignId: string) => Promise<ActionState>;
};

type Phase = "idle" | "watching" | "verifying" | "done" | "error";

// Intégration uniquement pour YouTube (iframe officielle, mode sans cookies). Les autres plateformes : lien externe.
function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (u.hostname.endsWith("youtube.com")) id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : null);
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch { return null; }
}

export function NoxiaRewardedCampaign({ campaign, alreadyRewarded = false, start, heartbeat, complete, claim }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(alreadyRewarded ? "done" : "idle");
  const [remaining, setRemaining] = useState(campaign.durationSeconds);
  const [message, setMessage] = useState<string | null>(alreadyRewarded ? "Récompense déjà obtenue pour cette campagne." : null);
  const completing = useRef(false);

  const embed = youtubeEmbed(campaign.videoUrl);
  const progress = Math.round(((campaign.durationSeconds - remaining) / campaign.durationSeconds) * 100);

  // Le compteur n'avance que si l'onglet est visible. Le SERVEUR reste l'autorité : il refuse si le temps réel n'est pas écoulé.
  useEffect(() => {
    if (phase !== "watching") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "watching") return;
    let busy = false;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      void heartbeat(campaign.id).finally(() => { busy = false; });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [phase, campaign.id, heartbeat]);

  const finishWatch = useCallback(async () => {
    if (completing.current) return;
    completing.current = true;
    const r = await complete(campaign.id);
    if (r.ok) void verify();
    else { setMessage(r.message); setPhase("error"); }
    completing.current = false;
  }, [campaign.id, complete]);

  useEffect(() => {
    if (phase === "watching" && remaining === 0) void finishWatch();
  }, [phase, remaining, finishWatch]);

  async function begin() {
    setMessage(null);
    const r = await start(campaign.id);
    if (!r.ok) { setMessage(r.message); setPhase("error"); return; }
    // Reprise : on retire le temps déjà écoulé côté serveur (horloge serveur, pas celle du navigateur).
    const elapsed = r.startedAtMs && r.serverNowMs ? Math.max(0, Math.floor((r.serverNowMs - r.startedAtMs) / 1000)) : 0;
    setRemaining(Math.max(0, campaign.durationSeconds - elapsed));
    setPhase("watching");
  }

  async function verify() {
    setPhase("verifying");
    const r = await claim(campaign.id);
    if (r.ok) {
      setMessage((r.creditsGranted ?? 0) > 0 ? `+${r.creditsGranted} crédits ajoutés à ton solde ✓` : "Récompense déjà obtenue pour cette campagne.");
      setPhase("done");
      router.refresh();
    } else { setMessage(r.message); setPhase("error"); }
  }

  return (
    <section className="rounded-2xl border border-violet-400/20 bg-slate-950/90 p-5 text-white shadow-xl">
      <p className="text-xs uppercase tracking-[0.2em] text-violet-300">NOXIA Reward · {campaign.platform}</p>
      <h3 className="mt-1 text-lg font-semibold">{campaign.title}</h3>
      <p className="mt-1 text-sm text-slate-300">+2 crédits · {campaign.durationSeconds}s · visionnage complet requis</p>

      {(phase === "watching" || phase === "verifying" || phase === "error") && (
        <div className="mt-4">
          {embed ? (
            <iframe title={campaign.title} src={embed} className="aspect-video w-full rounded-xl border border-white/10" allow="encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
          ) : (
            <a href={campaign.videoUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm hover:bg-white/10">
              Ouvrir la vidéo dans un nouvel onglet, puis reviens ici ↗
            </a>
          )}
        </div>
      )}

      {phase === "watching" && (
        <div className="mt-4" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-sm text-slate-300">{remaining}s restantes — garde cet onglet ouvert.</p>
        </div>
      )}

      {phase === "idle" && (
        <button type="button" onClick={begin} className="mt-4 min-h-11 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium hover:bg-violet-500">Commencer</button>
      )}

      {phase === "verifying" && (
        <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
          Visionnage validé. Vérification de la récompense…
        </div>
      )}

      {phase === "error" && (
        <button type="button" onClick={begin} className="mt-4 min-h-11 w-full rounded-xl border border-white/15 px-4 py-3 text-sm hover:bg-white/5">Réessayer</button>
      )}

      {message && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${phase === "done" ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>{message}</p>}
    </section>
  );
}
