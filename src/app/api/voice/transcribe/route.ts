import { NextResponse } from "next/server";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { NOXIA_GENERATION_COSTS } from "@/lib/generation-costs";
import { generationGateway } from "@/lib/generation-gateway";
import { cloudflareTranscribe, cloudflareVoiceConfig } from "@/lib/ai/providers/voice/cloudflare-voice";

const MAX_BYTES = 10 * 1024 * 1024;
const STT_COST = NOXIA_GENERATION_COSTS.voice.sttPer30Seconds; // minimum reservation; authoritative duration is not exposed by this pipeline yet
const ALLOWED_TYPES = new Set([
  "audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/ogg;codecs=opus",
  "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/m4a",
]);

export async function POST(request: Request) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const cf = cloudflareVoiceConfig();
  if (!cf) return NextResponse.json({ error: "La reconnaissance vocale NOXIA n'est pas encore configurée." }, { status: 503 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Audio invalide." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Audio trop volumineux (10 Mo maximum)." }, { status: 413 });
  if (file.type && !ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Format audio non pris en charge." }, { status: 415 });

  const audioBytes = new Uint8Array(await file.arrayBuffer());

  const reservation = await generationGateway.reserveVoice({ supabase: gate.supabase, kind: "stt", amount: STT_COST, dailyLimit: 60 });
  if (reservation.id === null) {
    const message = reservation.code === "DAILY_LIMIT" ? "Limite quotidienne de voix atteinte. Réessaie demain." : "Crédits insuffisants ou limite vocale atteinte.";
    return NextResponse.json({ error: message }, { status: 402 });
  }
  const reservationId = reservation.id;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let transcript = "";
  try {
    transcript = await cloudflareTranscribe(cf, audioBytes, controller.signal, file.type);
    if (!transcript) { await generationGateway.releaseVoice(gate.supabase, reservationId); return NextResponse.json({ error: "Aucune parole détectée." }, { status: 422 }); }
    if (transcript.length > 4000) transcript = transcript.slice(0, 4000).trim();
  } catch {
    await generationGateway.releaseVoice(gate.supabase, reservationId);
    return NextResponse.json({ error: "Le service de reconnaissance vocale est indisponible." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const { error: finalizeError } = await generationGateway.finalizeVoice(gate.supabase, reservationId);
  if (finalizeError) {
    await generationGateway.releaseVoice(gate.supabase, reservationId);
    return NextResponse.json({ error: "Impossible de finaliser la consommation vocale." }, { status: 500 });
  }

  return NextResponse.json({ text: transcript, cost: STT_COST }, { headers: { "Cache-Control": "no-store" } });
}
