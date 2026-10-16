import "server-only";
import type { MusicJob, MusicProvider, MusicRequest } from "@/lib/ai/music/types";
import { ProviderError } from "@/lib/providers/errors";
import { providerFetchBytes } from "@/lib/providers/http";
import { MAX_BYTES } from "@/lib/storage/policy";

// ElevenLabs Music — composition à partir d'un prompt texte.
// Documentation : https://elevenlabs.io/docs/api-reference/music/compose
//   POST https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128   (en-tête xi-api-key, corps JSON)
//   prompt (≤ 4100 caractères) · music_length_ms (3000–600000) · model_id (music_v1 par défaut) · force_instrumental (booléen, avec prompt)
// L'API renvoie directement des OCTETS audio : requiresStorage force un stockage serveur avant disponibilité. Réservé aux comptes ElevenLabs payants.
// Le format MP3 est toujours livré : le choix « wav » du formulaire n'est pas transmis (aucun format WAV documenté ici).
// Les noms d'artistes, titres de chansons et paroles protégées sont interdits par les conditions d'ElevenLabs.
// NON testé par un appel réel depuis ce code (banc de test avec faux fetch uniquement).
const ENDPOINT = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";
const MAX_PROMPT = 4100;

function classify(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof TypeError) return new ProviderError("PROVIDER_UNAVAILABLE", "network");
  return new ProviderError("GENERATION_FAILED", "elevenlabs_music_error");
}

export function musicPromptFor(req: MusicRequest): string {
  const parts = [
    req.prompt,
    `Style: ${req.style}. Mood: ${req.mood}.`,
    req.bpm ? `Tempo: about ${req.bpm} BPM.` : "",
    req.instruments ? `Instruments: ${req.instruments}.` : "",
    req.instrumental ? "Instrumental only, no vocals." : "",
  ].filter(Boolean);
  return parts.join(" ").slice(0, MAX_PROMPT);
}

export class ElevenLabsMusic implements MusicProvider {
  readonly id = "elevenlabs";
  constructor(private readonly apiKey: string, private readonly model: string, private readonly timeoutMs = 300_000) {
    if (!apiKey.trim()) throw new ProviderError("PROVIDER_MISCONFIGURED", "missing_key");
  }

  async generate(req: MusicRequest, opts: { signal?: AbortSignal } = {}): Promise<MusicJob> {
    if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "aborted_before_request");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const { bytes, contentType } = await providerFetchBytes(ENDPOINT, {
        method: "POST",
        headers: { "xi-api-key": this.apiKey },
        body: {
          prompt: musicPromptFor(req),
          music_length_ms: req.durationSeconds * 1000,
          model_id: this.model || "music_v1",
          force_instrumental: req.instrumental,
        },
        signal: controller.signal,
        accept: "audio/mpeg",
      }, { maxBytes: MAX_BYTES.audio });

      if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "aborted_after_request");
      const mime = contentType.split(";", 1)[0].trim().toLowerCase();
      if (mime !== "audio/mpeg" || bytes.byteLength === 0) throw new ProviderError("RESULT_INVALID", "music_result");
      if (bytes[0] !== 0x49 && bytes[0] !== 0xff) throw new ProviderError("RESULT_INVALID", "music_magic"); // « ID3 » ou trame MP3
      return { status: "completed", result: { asset: { mimeType: "audio/mpeg", durationSeconds: req.durationSeconds, bytes, extension: "mp3" } } };
    } catch (e) {
      throw classify(e);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: !!this.apiKey }; // aucune génération : on signale seulement que la clé est configurée
  }
}
