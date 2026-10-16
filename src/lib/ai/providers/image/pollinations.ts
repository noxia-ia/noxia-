import "server-only";
import type { ImageAsset, ImageJob, ImageProvider, ImageRequest } from "@/lib/ai/image/types";
import { inspectImageBytes, assertDeclaredMime, MAX_IMAGE_BYTES, type InspectedImage } from "@/lib/ai/image/bytes";
import { providerFetchBytes } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/errors";
import { getStorageProvider, persistBytes, discardStored } from "@/lib/storage";
import { buildPrompt, RATIO_SIZES } from "./huggingface";
import { optimizeImagePrompt } from "@/lib/ai/media-params";

// Fournisseur IMAGE : Pollinations (https://gen.pollinations.ai).
//   • Requête : GET https://gen.pollinations.ai/image/{prompt}?model=…&width=…&height=…&seed=…&nologo=true&enhance=false&safe=true, en-tête « Authorization: Bearer <clé> ».
//     Paramètres vérifiés dans la documentation publique Pollinations (model, width, height, seed, nologo, enhance, safe).
//   • Réponse : l'image en OCTETS (jpeg/png) → validation par les octets (type réel, troncature, dimensions) → stockage Supabase → storedUrl.
//   • Prompt Enhancer : celui de NOXIA (optimizeImagePrompt) est appliqué ICI ; `enhance=false` évite un double enrichissement côté Pollinations.
//   • Modèle : « flux » par défaut ; POLLINATIONS_MODEL_IMAGE le remplace ; POLLINATIONS_MODEL_IMAGE_ANIME (facultatif) est utilisé quand le style demandé est « anime ».
//     Les identifiants de modèles sont à confirmer sur https://gen.pollinations.ai/image/models : aucun n'est inventé par le code.
// NON testé par un appel réel depuis ce code. Hébergeur : la réponse est SYNCHRONE ; une durée supérieure à la limite des fonctions Netlify provoque une coupure.
const BASE = "https://gen.pollinations.ai/image/";
const MODEL_RE = /^[A-Za-z0-9._:-]{1,60}$/;
interface Shot extends InspectedImage { bytes: Uint8Array }

export const pollinationsImageModel = (req: Pick<ImageRequest, "style">, base: string): string =>
  (req.style === "anime" && process.env.POLLINATIONS_MODEL_IMAGE_ANIME?.trim()) || process.env.POLLINATIONS_MODEL_IMAGE?.trim() || base;

export function pollinationsImageUrl(req: ImageRequest, model: string, seed: number): string {
  const { width, height } = RATIO_SIZES[req.ratio];
  const prompt = optimizeImagePrompt(buildPrompt(req)).slice(0, 1500);
  const qs = new URLSearchParams({ model, width: String(width), height: String(height), seed: String(seed), nologo: "true", enhance: "false", safe: "true" });
  return `${BASE}${encodeURIComponent(prompt)}?${qs}`;
}

export class PollinationsImage implements ImageProvider {
  readonly id = "pollinations";
  constructor(private readonly apiKey: string, private readonly model: string, private readonly timeoutMs = 24_000) {
    void this.timeoutMs;
    if (!apiKey.trim()) throw new ProviderError("PROVIDER_MISCONFIGURED", "missing_key");
  }

  async generate(req: ImageRequest, opts?: { signal?: AbortSignal; userId?: string; generationId?: string }): Promise<ImageJob> {
    const signal = opts?.signal;
    if (!opts?.userId || !opts.generationId) throw new ProviderError("PROVIDER_MISCONFIGURED", "pol_img_no_context");
    const model = pollinationsImageModel(req, this.model);
    if (!MODEL_RE.test(model)) throw new ProviderError("PROVIDER_MISCONFIGURED", "pol_img_model");
    if (!getStorageProvider()) throw new ProviderError("PROVIDER_MISCONFIGURED", "pol_img_no_storage");

    const shots = await Promise.all(Array.from({ length: req.count }, () => this.render(req, model, signal)));
    const stored: string[] = [];
    const images: ImageAsset[] = [];
    try {
      for (const s of shots) {
        if (signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "pol_img_aborted_before_store");
        const r = await persistBytes({ userId: opts.userId, generationId: opts.generationId, bytes: s.bytes, mime: s.mime, ext: s.ext });
        stored.push(r.path);
        images.push({ url: r.storedUrl, storedUrl: r.storedUrl, mimeType: s.mime, width: s.width, height: s.height });
      }
    } catch (e) {
      await discardStored(stored);
      throw e instanceof ProviderError ? e : new ProviderError("GENERATION_FAILED", "pol_img_storage_failed");
    }
    return { status: "completed", result: { images } };
  }

  private async render(req: ImageRequest, model: string, signal?: AbortSignal): Promise<Shot> {
    const seed = Math.floor(Math.random() * 2_000_000_000); // une graine différente par image (sinon `count` images identiques)
    const { bytes, contentType } = await providerFetchBytes(pollinationsImageUrl(req, model, seed), {
      method: "GET", signal, accept: "image/png, image/jpeg, image/webp", headers: { Authorization: `Bearer ${this.apiKey}` },
    }, { maxBytes: MAX_IMAGE_BYTES });
    const info = inspectImageBytes(bytes, MAX_IMAGE_BYTES); // type réel par les octets, troncature, dimensions
    assertDeclaredMime(contentType, info.mime);
    return { ...info, bytes };
  }
}
