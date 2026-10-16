import "server-only";
import { providerFetchBytes } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/errors";
import { matchesMagic } from "@/lib/storage/policy";
import { cloudflareAccountId, cloudflareRunJson, cloudflareRunUrl } from "../cloudflare-client";

// Voix NOXIA via Cloudflare Workers AI (remplace ElevenLabs pour la voix ; ElevenLabs reste utilisé pour ASMR et musique).
//   • Reconnaissance (STT) : « @cf/openai/whisper-large-v3-turbo », corps JSON { audio: <base64>, language } → { result: { text } } (forme documentée par Cloudflare).
//     Modèle surchargeable par CLOUDFLARE_MODEL_STT.
//   • Synthèse (TTS) : modèle OBLIGATOIREMENT fourni par CLOUDFLARE_MODEL_TTS (ex. un modèle Deepgram Aura) ; voix optionnelle CLOUDFLARE_VOICE.
//     Selon le modèle, Cloudflare renvoie soit de l'audio binaire, soit du JSON { result: { audio: <base64> } } : les deux cas sont gérés, le contenu est vérifié par ses octets.
// NON testé par un appel réel depuis ce code (banc de test avec faux fetch uniquement).
export const DEFAULT_STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export interface CloudflareVoiceConfig { token: string; accountId: string }
export function cloudflareVoiceConfig(): CloudflareVoiceConfig | null {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim(), accountId = cloudflareAccountId();
  return token && accountId ? { token, accountId } : null;
}
export const ttsModel = () => process.env.CLOUDFLARE_MODEL_TTS?.trim() ?? "";
export const sttModel = () => process.env.CLOUDFLARE_MODEL_STT?.trim() || DEFAULT_STT_MODEL;

// Deepgram Nova-3 (« @cf/deepgram/nova-3 ») : l'audio est envoyé BRUT (Content-Type = type de l'enregistrement), la langue en paramètre d'URL (BCP-47, « fr »).
// Réponse au format Deepgram : results.channels[0].alternatives[0].transcript (sous « result » ou à la racine : les deux sont acceptés).
// Forme décrite dans la documentation Cloudflare (nova-3) ; NON testée par un appel réel depuis ce code.
async function transcribeNova3(cfg: CloudflareVoiceConfig, model: string, audio: Uint8Array, mime: string, signal?: AbortSignal): Promise<string> {
  const contentType = (mime || "audio/webm").split(";")[0].trim() || "audio/webm";
  let res: Response;
  try {
    res = await fetch(`${cloudflareRunUrl(cfg.accountId, model)}?language=fr`, { method: "POST", signal, headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": contentType, Accept: "application/json" }, body: audio as unknown as BodyInit });
  } catch { throw new ProviderError("PROVIDER_UNAVAILABLE", "cf_stt_network"); }
  if (!res.ok) throw new ProviderError(res.status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_UNAVAILABLE", "cf_stt_http");
  let data: { result?: { results?: DeepgramResults } | null; results?: DeepgramResults } | null = null;
  try { data = await res.json(); } catch { throw new ProviderError("RESULT_INVALID", "cf_stt_not_json"); }
  const transcript = (data?.result?.results ?? data?.results)?.channels?.[0]?.alternatives?.[0]?.transcript;
  return typeof transcript === "string" ? transcript.trim() : "";
}
interface DeepgramResults { channels?: { alternatives?: { transcript?: unknown }[] }[] }

export async function cloudflareTranscribe(cfg: CloudflareVoiceConfig, audio: Uint8Array, signal?: AbortSignal, mime = "audio/webm"): Promise<string> {
  const model = sttModel();
  if (/deepgram\/nova-3/i.test(model)) return transcribeNova3(cfg, model, audio, mime, signal);
  const result = await cloudflareRunJson(cfg.token, cfg.accountId, sttModel(), { audio: Buffer.from(audio).toString("base64"), language: "fr" }, signal);
  const text = (result as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text.trim() : "";
}

const AUDIO_KINDS: { mime: string }[] = [{ mime: "audio/mpeg" }, { mime: "audio/wav" }, { mime: "audio/ogg" }, { mime: "audio/mp4" }];
export async function cloudflareSpeak(cfg: CloudflareVoiceConfig, text: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mime: string }> {
  const model = ttsModel();
  if (!model) throw new ProviderError("PROVIDER_MISCONFIGURED", "cf_tts_model");
  const voice = process.env.CLOUDFLARE_VOICE?.trim();
  const { bytes, contentType } = await providerFetchBytes(cloudflareRunUrl(cfg.accountId, model), {
    method: "POST", signal, accept: "audio/*, application/json", headers: { Authorization: `Bearer ${cfg.token}` },
    body: { text, ...(voice ? { speaker: voice } : {}) },
  }, { maxBytes: MAX_AUDIO_BYTES });
  let audio = bytes;
  if (/json/i.test(contentType)) { // réponse JSON : { success, result: { audio: base64 } }
    let parsed: { success?: unknown; result?: { audio?: unknown } | null } | null = null;
    try { parsed = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { throw new ProviderError("RESULT_INVALID", "cf_tts_not_json"); }
    if (parsed?.success === false) throw new ProviderError("PROVIDER_UNAVAILABLE", "cf_error_in_body");
    const b64 = parsed?.result?.audio;
    if (typeof b64 !== "string" || !b64) throw new ProviderError("RESULT_INVALID", "cf_tts_no_audio");
    audio = new Uint8Array(Buffer.from(b64, "base64"));
  }
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) throw new ProviderError("RESULT_INVALID", "cf_tts_size");
  const kind = AUDIO_KINDS.find(k => matchesMagic(k.mime, audio)); // type réel par les octets, jamais le type annoncé
  if (!kind) throw new ProviderError("RESULT_INVALID", "cf_tts_not_audio");
  return { bytes: audio, mime: kind.mime };
}
