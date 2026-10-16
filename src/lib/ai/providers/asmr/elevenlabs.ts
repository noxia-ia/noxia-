import "server-only";
import type { ASMRJob, ASMRProvider, ASMRRequest } from "@/lib/ai/asmr/types";
import { ProviderError } from "@/lib/providers/errors";
import { providerFetchBytes } from "@/lib/providers/http";
import { MAX_BYTES } from "@/lib/storage/policy";

// ElevenLabs Text-to-Sound Effects.
// Official endpoint: POST https://api.elevenlabs.io/v1/sound-generation
// The API returns audio bytes directly, so the storage layer persists them server-side.
const ENDPOINT = "https://api.elevenlabs.io/v1/sound-generation";
const MODEL = "eleven_text_to_sound_v2";

function classify(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof TypeError) return new ProviderError("PROVIDER_UNAVAILABLE", "network");
  return new ProviderError("GENERATION_FAILED", "elevenlabs_error");
}

function promptFor(req: ASMRRequest): string {
  return [
    "ASMR sound effect, no speech, no music.",
    `Style: ${req.style}.`,
    `Ambiance: ${req.ambiance}.`,
    `Scene: ${req.prompt}`,
    "Close-mic, detailed, realistic foley, clean recording, immersive texture.",
  ].join(" ");
}

export class ElevenLabsASMR implements ASMRProvider {
  readonly id = "elevenlabs";
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(apiKey: string, _model: string, timeoutMs = 180_000) {
    if (!apiKey.trim()) throw new ProviderError("PROVIDER_MISCONFIGURED", "missing_key");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async generate(req: ASMRRequest, opts: { signal?: AbortSignal } = {}): Promise<ASMRJob> {
    if (req.type !== "audio") throw new ProviderError("INVALID_REQUEST", "elevenlabs_audio_only");
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
          text: promptFor(req),
          model_id: MODEL,
          duration_seconds: req.durationSeconds,
          output_format: "mp3_44100_128",
          prompt_influence: req.style === "ultra_realistic" ? 0.85 : 0.65,
        },
        signal: controller.signal,
        accept: "audio/mpeg",
      }, { maxBytes: MAX_BYTES.audio });

      if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "aborted_after_request");
      const mime = contentType.split(";", 1)[0].trim().toLowerCase();
      if (mime !== "audio/mpeg" || bytes.byteLength === 0) throw new ProviderError("RESULT_INVALID", "audio_result");
      if (bytes[0] !== 0x49 && bytes[0] !== 0xff) throw new ProviderError("RESULT_INVALID", "audio_magic");

      return {
        status: "completed",
        result: {
          asset: {
            kind: "audio",
            mimeType: "audio/mpeg",
            durationSeconds: req.durationSeconds,
            bytes,
            extension: "mp3",
          },
        },
      };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw classify(e);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    // No generation is performed by healthCheck: administration only reports that the key is configured.
    return { ok: !!this.apiKey };
  }
}
