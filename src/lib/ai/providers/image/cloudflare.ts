import "server-only";
import type { ImageAsset, ImageJob, ImageProvider, ImageRequest } from "@/lib/ai/image/types";
import { inspectImageBytes, MAX_IMAGE_BYTES, type InspectedImage } from "@/lib/ai/image/bytes";
import { providerFetchJson } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/errors";
import { getStorageProvider, persistBytes, discardStored } from "@/lib/storage";
import { buildPrompt } from "./huggingface";
import { imageSteps, optimizeImagePrompt } from "@/lib/ai/media-params";

// Fournisseur IMAGE : Cloudflare Workers AI, modèle FLUX.1 schnell (API REST).
//   • Requête : POST https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/run/@cf/black-forest-labs/flux-1-schnell
//               en-tête « Authorization: Bearer <jeton> », corps JSON { "prompt": "...", "steps": 4 }.
//   • Réponse : JSON { "result": { "image": "<image encodée en base64>" }, "success": true, ... }.
// Limites connues : NON testé par un appel réel depuis ce code. Le modèle n'accepte pas de largeur/hauteur : le ratio, la qualité et le format demandés
// ne sont pas transmis ; seules les dimensions RÉELLES de l'image reçue sont enregistrées.
// Flux : base64 → octets → validation (type réel, troncature, dimensions) → Supabase Storage → storedUrl.
const ACCOUNT_RE = /^[a-f0-9]{32}$/i;
// Étapes FLUX schnell : 1 à 8 selon la qualité demandée (standard 4, hd 6, ultra 8) — voir src/lib/ai/media-params.ts.

interface Shot extends InspectedImage { bytes: Uint8Array }

export class CloudflareImage implements ImageProvider {
  readonly id = "cloudflare";
  constructor(private readonly apiToken: string, private readonly accountId: string, private readonly model: string) {}

  async generate(req: ImageRequest, opts?: { signal?: AbortSignal; userId?: string; generationId?: string }): Promise<ImageJob> {
    const signal = opts?.signal;
    if (!opts?.userId || !opts.generationId) throw new ProviderError("PROVIDER_MISCONFIGURED", "cf_no_context");
    if (!ACCOUNT_RE.test(this.accountId)) throw new ProviderError("PROVIDER_MISCONFIGURED", "cf_account_id");
    if (!getStorageProvider()) throw new ProviderError("PROVIDER_MISCONFIGURED", "cf_no_storage");

    const shots = await Promise.all(Array.from({ length: req.count }, () => this.render(req, signal)));

    const stored: string[] = [];
    const images: ImageAsset[] = [];
    try {
      for (const s of shots) {
        if (signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "cf_aborted_before_store");
        const r = await persistBytes({ userId: opts.userId, generationId: opts.generationId, bytes: s.bytes, mime: s.mime, ext: s.ext });
        stored.push(r.path);
        images.push({ url: r.storedUrl, storedUrl: r.storedUrl, mimeType: s.mime, width: s.width, height: s.height });
      }
    } catch (e) {
      await discardStored(stored);
      throw e instanceof ProviderError ? e : new ProviderError("GENERATION_FAILED", "cf_storage_failed");
    }
    return { status: "completed", result: { images } };
  }

  private async render(req: ImageRequest, signal?: AbortSignal): Promise<Shot> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
    const json = await providerFetchJson(url, {
      method: "POST", signal, headers: { Authorization: `Bearer ${this.apiToken}` },
      body: { prompt: optimizeImagePrompt(buildPrompt(req)), steps: imageSteps(req.quality) },
    });
    const b64 = (json as { result?: { image?: unknown } } | null)?.result?.image;
    if (typeof b64 !== "string" || b64.length === 0) throw new ProviderError("RESULT_INVALID", "cf_no_image");
    const bytes = new Uint8Array(Buffer.from(b64, "base64"));
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw new ProviderError("RESULT_INVALID", "cf_size");
    const info = inspectImageBytes(bytes, MAX_IMAGE_BYTES); // type réel par les octets, troncature, dimensions
    return { ...info, bytes };
  }
  // Pas de healthCheck() : aucun test de santé gratuit et fiable n'a été confirmé pour ce type de jeton. Seule la configuration est vérifiée dans /admin/providers.
}
