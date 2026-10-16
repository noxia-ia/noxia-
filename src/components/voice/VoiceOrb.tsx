"use client";
import { useEffect, useRef, type MutableRefObject } from "react";

export type OrbState = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

// Orbe IA : sphère lumineuse (dégradés violet / rose) au centre du mode vocal.
//  • écoute : le niveau RÉEL du micro (levelRef, 0 à 1) fait gonfler l'orbe et agrandit les ondes ;
//  • parole : pulsation SIMULÉE (le niveau sonore de la voix de synthèse n'est pas mesuré) ;
//  • réflexion / compréhension : rotation lente. Les animations sont coupées si l'utilisateur demande « moins de mouvement ».
export function VoiceOrb({ state, levelRef, size = 240 }: { state: OrbState; levelRef?: MutableRefObject<number>; size?: number }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, smooth = 0;
    const tick = (t: number) => {
      const target = state === "listening" ? (levelRef?.current ?? 0) : state === "speaking" ? 0.35 + 0.3 * Math.abs(Math.sin(t / 170) * Math.sin(t / 430)) : 0;
      smooth += (target - smooth) * 0.18;
      root.current?.style.setProperty("--lvl", smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, levelRef]);
  return (
    <div ref={root} className="nx-orb" data-state={state} style={{ width: size, height: size }} role="img" aria-label={state === "listening" ? "NOXIA écoute" : state === "speaking" ? "NOXIA parle" : state === "idle" ? "NOXIA est prête" : "NOXIA réfléchit"}>
      <span className="nx-orb-wave nx-orb-wave-1" /><span className="nx-orb-wave nx-orb-wave-2" /><span className="nx-orb-wave nx-orb-wave-3" />
      <span className="nx-orb-glow" />
      <span className="nx-orb-core"><span className="nx-orb-blob nx-orb-blob-a" /><span className="nx-orb-blob nx-orb-blob-b" /><span className="nx-orb-shine" /></span>
    </div>
  );
}
