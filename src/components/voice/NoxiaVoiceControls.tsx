"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { NoxiaPresence } from "@/components/voice/NoxiaPresence";
import { VoiceOrb } from "@/components/voice/VoiceOrb";

type VoiceState = "idle" | "listening" | "transcribing" | "speaking" | "thinking";

const AUTO_SILENCE_MS = 1200;
const AUTO_MAX_CAPTURE_MS = 30_000;
const VOICE_REARM_DELAY_MS = 350;

export function NoxiaVoiceControls({
  text,
  onTranscript,
  onVoiceSubmit,
  disabled = false,
  thinking = false,
}: {
  text: string;
  onTranscript: (v: string) => void;
  onVoiceSubmit?: (v: string) => void;
  disabled?: boolean;
  thinking?: boolean;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceFrameRef = useRef<number | null>(null);
  const captureTimeoutRef = useRef<number | null>(null);
  const speechStartedRef = useRef(false);
  const stoppedByModeRef = useRef(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [supported, setSupported] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenText = useRef("");
  const transcribeAbort = useRef<AbortController | null>(null);
  const ttsAbort = useRef<AbortController | null>(null);
  const audioUrl = useRef<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const levelRef = useRef(0); // niveau réel du micro (0 à 1) pour animer l'orbe

  useEffect(() => {
    setSupported(typeof window !== "undefined" && Boolean(typeof navigator.mediaDevices?.getUserMedia === "function" && window.MediaRecorder));
  }, []);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    if (thinking) setState("thinking");
    else if (state === "thinking") setState("idle");
  }, [thinking, state]);

  const handleTranscript = useCallback((value: string) => {
    const clean = value.trim();
    if (!clean) return;
    onTranscript(clean);
    onVoiceSubmit?.(clean);
  }, [onTranscript, onVoiceSubmit]);

  const cleanupCapture = useCallback(() => {
    if (silenceFrameRef.current !== null) cancelAnimationFrame(silenceFrameRef.current);
    silenceFrameRef.current = null;
    if (captureTimeoutRef.current !== null) window.clearTimeout(captureTimeoutRef.current);
    captureTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    transcribeAbort.current?.abort();
    const controller = new AbortController();
    transcribeAbort.current = controller;
    setState("transcribing");
    try {
      const form = new FormData();
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      form.append("file", blob, `noxia-voice.${extension}`);
      const r = await fetch("/api/voice/transcribe", { method: "POST", body: form, signal: controller.signal });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof j?.error === "string" ? j.error : "La transcription a échoué.");
      const value = typeof j?.text === "string" ? j.text.trim() : "";
      if (!value) throw new Error("Aucune parole détectée.");
      handleTranscript(value);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setNotice(e instanceof Error ? e.message : "La transcription a échoué.");
      setState("idle");
    } finally {
      if (transcribeAbort.current === controller) transcribeAbort.current = null;
    }
  }, [handleTranscript]);

  const stopCapture = useCallback((silent = false) => {
    stoppedByModeRef.current = silent;
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.stop();
      return;
    }
    cleanupCapture();
    if (!silent) setState("idle");
  }, [cleanupCapture]);

  const startServerCapture = useCallback(async (autoStop = false) => {
    if (disabled || state === "transcribing" || state === "thinking" || state === "speaking") return;
    setNotice(null);
    if (state === "listening") { stopCapture(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunks.current = [];
      speechStartedRef.current = false;
      stoppedByModeRef.current = false;
      media.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      media.onstop = () => {
        cleanupCapture();
        recorder.current = null;
        const blob = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });
        chunks.current = [];
        if (blob.size > 0) void transcribe(blob);
        else setState("idle");
      };
      recorder.current = media;
      media.start(250);
      setState("listening");

      captureTimeoutRef.current = window.setTimeout(() => {
        stopCapture();
      }, AUTO_MAX_CAPTURE_MS + 250);

      if (autoStop && typeof AudioContext !== "undefined") {
        const context = new AudioContext();
        audioContextRef.current = context;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let silenceSince = 0;
        const startedAt = performance.now();
        const detect = () => {
          if (!recorder.current || recorder.current.state === "inactive") return;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const normalized = (data[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / data.length);
          levelRef.current = Math.min(1, rms * 7);
          const now = performance.now();
          if (rms > 0.035) {
            speechStartedRef.current = true;
            silenceSince = 0;
          } else if (speechStartedRef.current) {
            if (!silenceSince) silenceSince = now;
            if (now - silenceSince >= AUTO_SILENCE_MS) {
              stopCapture();
              return;
            }
          }
          if (now - startedAt >= AUTO_MAX_CAPTURE_MS) {
            stopCapture();
            return;
          }
          silenceFrameRef.current = requestAnimationFrame(detect);
        };
        silenceFrameRef.current = requestAnimationFrame(detect);
      }
    } catch {
      cleanupCapture();
      setNotice("Impossible d'accéder au microphone. Vérifie l'autorisation du navigateur.");
      setState("idle");
    }
  }, [cleanupCapture, disabled, state, stopCapture, transcribe]);

  const stopPlayback = useCallback(() => {
    ttsAbort.current?.abort();
    ttsAbort.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
    }
    setState((current) => current === "speaking" ? "idle" : current);
  }, []);

  const startVoiceLoop = useCallback(() => {
    if (!voiceModeRef.current || disabled || thinking || state === "listening" || state === "transcribing" || state === "speaking") return;
    if (supported) void startServerCapture(true);
  }, [disabled, startServerCapture, state, supported, thinking]);

  useEffect(() => () => {
    stopCapture(true);
    transcribeAbort.current?.abort();
    ttsAbort.current?.abort();
    audioRef.current?.pause();
    cleanupCapture();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, [cleanupCapture, stopCapture]);


  async function listen() {
    if (!supported) {
      setNotice("La conversation vocale NOXIA nécessite l'accès microphone MediaRecorder dans ce navigateur.");
      return;
    }
    return startServerCapture(false);
  }

  // Repli : Web Speech API (synthèse du navigateur). Gratuit ; la qualité dépend des voix installées sur l'appareil.
  function speakWithBrowser(): boolean {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return false;
    const u = new SpeechSynthesisUtterance(text.slice(0, 3000));
    u.lang = "fr-FR";
    const v = window.speechSynthesis.getVoices().find(x => x.lang.toLowerCase().startsWith("fr"));
    if (v) u.voice = v;
    const done = () => { setState("idle"); if (voiceModeRef.current && supported && !disabled) window.setTimeout(startVoiceLoop, VOICE_REARM_DELAY_MS); };
    u.onend = done; u.onerror = done;
    setState("speaking");
    window.speechSynthesis.speak(u);
    return true;
  }

  async function speak() {
    if (disabled || !text.trim() || state === "thinking" || state === "transcribing") return;
    setNotice(null);
    if (state === "speaking") { stopPlayback(); return; }

    stopPlayback();
    try { window.speechSynthesis?.cancel(); } catch { /* synthèse navigateur indisponible */ }
    const controller = new AbortController();
    ttsAbort.current = controller;
    setState("speaking");
    try {
      const r = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(typeof j?.error === "string" ? j.error : "La voix NOXIA n’est pas disponible.");
      }
      const blob = await r.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      audioUrl.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current !== audio) return;
        audioRef.current = null;
        if (audioUrl.current === url) { URL.revokeObjectURL(url); audioUrl.current = null; }
        setState("idle");
        if (voiceModeRef.current && supported && !disabled) {
          window.setTimeout(startVoiceLoop, VOICE_REARM_DELAY_MS);
        }
      };
      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        audioRef.current = null;
        if (audioUrl.current === url) { URL.revokeObjectURL(url); audioUrl.current = null; }
        setState("idle");
        setNotice("La lecture vocale a échoué.");
      };
      await audio.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (speakWithBrowser()) { setNotice("Voix du navigateur utilisée (voix NOXIA indisponible)."); return; } // repli gratuit, avec voix française si le navigateur en propose une
      setState("idle");
      setNotice(e instanceof Error ? e.message : "La synthèse vocale a échoué.");
    } finally {
      if (ttsAbort.current === controller) ttsAbort.current = null;
    }
  }

  useEffect(() => {
    if (!voiceMode || thinking || !text.trim() || text === lastSpokenText.current) return;
    lastSpokenText.current = text;
    void speak();
  }, [voiceMode, thinking, text]);

  function toggleVoiceMode() {
    setVoiceMode((enabled) => {
      const next = !enabled;
      voiceModeRef.current = next;
      if (next) {
        lastSpokenText.current = text;
        setNotice(null);
        if (!supported) setNotice("Le mode conversation continue nécessite l’accès microphone MediaRecorder dans ce navigateur.");
        else window.setTimeout(startVoiceLoop, VOICE_REARM_DELAY_MS);
      } else {
        stopCapture(true);
        stopPlayback();
        setState("idle");
      }
      return next;
    });
  }

  const label = state === "listening" ? "⏹ Arrêter l’écoute" : state === "transcribing" ? "⏳ Compréhension…" : state === "thinking" ? "🧠 NOXIA réfléchit…" : "🎙️ Parler à NOXIA";

  return <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-md">
    {voiceMode && (
      <div role="dialog" aria-label="Conversation vocale NOXIA" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#05050d]/85 p-6 backdrop-blur-md">
        <VoiceOrb state={state} levelRef={levelRef} size={280} />
        <p className="text-lg font-medium text-white" role="status">{state === "listening" ? "Je t'écoute…" : state === "transcribing" ? "Je comprends…" : state === "thinking" ? "Je réfléchis…" : state === "speaking" ? "NOXIA parle" : "Parle quand tu veux"}</p>
        <button type="button" onClick={toggleVoiceMode} className="min-h-11 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 text-sm font-semibold text-white">Terminer la conversation</button>
      </div>
    )}
    <NoxiaPresence state={state} />
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={listen} disabled={disabled || state === "transcribing" || state === "thinking" || !supported} aria-pressed={state === "listening"} className="min-h-11 rounded-sm border border-violet-400/30 bg-noxia-night px-4 text-sm text-noxia-silver hover:border-violet-400 disabled:opacity-50">{label}</button>
      <button type="button" onClick={speak} disabled={disabled || !text.trim() || state === "thinking" || state === "transcribing"} aria-pressed={state === "speaking"} className="min-h-11 rounded-sm border border-violet-400/30 bg-noxia-night px-4 text-sm text-noxia-silver hover:border-violet-400 disabled:opacity-50">{state === "speaking" ? "⏹ Arrêter la voix" : "🔊 Écouter NOXIA"}</button>
      <button type="button" onClick={toggleVoiceMode} disabled={disabled || state === "transcribing"} aria-pressed={voiceMode} className={`min-h-11 rounded-sm border px-4 text-sm ${voiceMode ? "border-violet-300 bg-violet-500/15 text-violet-200" : "border-violet-400/30 bg-noxia-night text-noxia-silver"}`}>
        {voiceMode ? "🗣️ Conversation vocale activée" : "🗣️ Activer la conversation vocale"}
      </button>
      {state === "listening" && <span className="text-xs text-violet-300" role="status">NOXIA t’écoute…</span>}
      {state === "thinking" && <span className="text-xs text-violet-300" role="status">NOXIA prépare sa réponse…</span>}
      {!supported && <span className="text-xs text-noxia-ash">Ce navigateur ne prend pas en charge la capture microphone serveur requise par NOXIA.</span>}
    </div>
    {voiceMode && <p className="text-xs text-noxia-ash" role="status">Mode vocal mains libres : parle après le signal d’écoute, le le silence peut terminer automatiquement la capture, puis NOXIA transcrit, répond et parle. Une capture est limitée à 30 secondes et chaque transcription serveur consomme le crédit vocal correspondant.</p>}
    {notice && <span role="alert" className="text-xs text-amber-300">{notice}</span>}
  </div>;
}
