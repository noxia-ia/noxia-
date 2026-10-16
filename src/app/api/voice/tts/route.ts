import { NextResponse } from "next/server";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { generationGateway, voiceTtsCost } from "@/lib/generation-gateway";
import { cloudflareSpeak, cloudflareVoiceConfig, ttsModel } from "@/lib/ai/providers/voice/cloudflare-voice";

const MAX_TEXT = 4000;

export async function POST(request: Request) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const cf = cloudflareVoiceConfig();
  if (!cf || !ttsModel()) {
    return NextResponse.json({ error: "La voix NOXIA n'est pas encore configurée." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  const text = typeof body === "object" && body !== null && "text" in body ? String((body as { text?: unknown }).text ?? "").trim() : "";
  if (!text) return NextResponse.json({ error: "Texte manquant." }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: `Texte trop long (${MAX_TEXT} caractères maximum).` }, { status: 400 });

  const voiceCost = voiceTtsCost(text);
  const reservation = await generationGateway.reserveVoice({ supabase: gate.supabase, kind: "tts", amount: voiceCost, dailyLimit: 60 });
  if (reservation.id === null) {
    const message = reservation.code === "DAILY_LIMIT" ? "Limite quotidienne de voix atteinte. Réessaie demain." : "Crédits insuffisants ou limite vocale atteinte.";
    return NextResponse.json({ error: message }, { status: 402 });
  }
  const reservationId = reservation.id;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let audio: Uint8Array, mime: string;
  try {
    ({ bytes: audio, mime } = await cloudflareSpeak(cf, text, controller.signal));
  } catch {
    await generationGateway.releaseVoice(gate.supabase, reservationId); // aucun crédit débité si la synthèse échoue
    return NextResponse.json({ error: "Le service vocal est indisponible." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const { error: finalizeError } = await generationGateway.finalizeVoice(gate.supabase, reservationId);
  if (finalizeError) {
    await generationGateway.releaseVoice(gate.supabase, reservationId);
    return NextResponse.json({ error: "Impossible de finaliser la consommation vocale." }, { status: 500 });
  }

  return new Response(Buffer.from(audio), {
    status: 200,
    headers: {
      "content-type": mime,
      "cache-control": "no-store",
      "x-noxia-voice-cost": String(voiceCost),
    },
  });
}
