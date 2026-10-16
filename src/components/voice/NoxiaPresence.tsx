"use client";

type PresenceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

export function NoxiaPresence({ state }: { state: PresenceState }) {
  const label = state === "listening" ? "NOXIA écoute" : state === "transcribing" ? "NOXIA comprend" : state === "thinking" ? "NOXIA réfléchit" : state === "speaking" ? "NOXIA parle" : "NOXIA est prête";
  const active = state !== "idle";

  return (
    <div className="flex items-center gap-3" aria-live="polite" aria-label={label}>
      <div className={`relative grid h-14 w-14 place-items-center rounded-full border border-violet-400/40 bg-[#0a0b1a] shadow-[0_0_24px_rgba(139,92,246,0.18)] ${active ? "" : "opacity-80"}`}>
        <span className={`absolute inset-1 rounded-full border border-violet-400/20 ${active ? "animate-pulse" : ""}`} />
        <span className={`h-5 w-5 rounded-full bg-gradient-to-br from-violet-300 via-violet-500 to-blue-500 ${state === "speaking" ? "animate-pulse" : ""}`} />
        {state === "listening" && <span className="absolute -inset-1 rounded-full border border-violet-300/30 animate-ping" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-noxia-silver">{label}</p>
        <p className="text-xs text-noxia-ash">{state === "listening" ? "Je t'écoute…" : state === "transcribing" ? "Je transforme ta voix en message…" : state === "thinking" ? "Je prépare ma réponse…" : state === "speaking" ? "Je te réponds oralement…" : "Texte et voix sont prêts."}</p>
      </div>
    </div>
  );
}
