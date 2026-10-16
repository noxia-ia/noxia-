import "server-only";
import type { ImageAsset, ImageJob, ImageProvider, ImageRatio, ImageRequest, ImageStyle } from "@/lib/ai/image/types";
import { inspectImageBytes, assertDeclaredMime, MAX_IMAGE_BYTES, type InspectedImage } from "@/lib/ai/image/bytes";
import { providerFetchBytes, providerFetchJson } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/errors";
import { getStorageProvider, persistBytes, discardStored } from "@/lib/storage";

// Fournisseur IMAGE : Hugging Face Inference Providers, fournisseur « hf-inference », tâche « text-to-image ».
// Source : documentation officielle « Inference Providers › Tasks › Text to Image » (consultée le 03/10/2026).
//   • Requête  : POST https://router.huggingface.co/hf-inference/models/<organisation>/<modèle>, en-tête « Authorization: Bearer <jeton> » (jeton avec la permission « Inference Providers »),
//                corps JSON { "inputs": "<prompt>", "parameters": { "width": n, "height": n } }.
//   • Réponse  : l'image en OCTETS BRUTS dans le corps (pas de JSON, pas d'URL).
//   • Non confirmé par un appel réel (aucune clé ni accès réseau lors de l'étape 14) : le schéma d'URL exact pour la tâche text-to-image sur hf-inference (déduit du schéma documenté
//     https://router.huggingface.co/hf-inference/models/<modèle>), la disponibilité du modèle choisi, ses limites de largeur/hauteur et le Content-Type renvoyé.
// Flux : octets → validation (type réel, troncature, dimensions) → Supabase Storage → storedUrl. Aucune data: URL, aucune URL factice, rien n'est stocké tant qu'une image est invalide.
const ROUTER = "https://router.huggingface.co/hf-inference/models/";
const WHOAMI = "https://huggingface.co/api/whoami-v2"; // validité du jeton (lecture seule, aucun crédit) — décrit par l'équipe Hugging Face sur son forum officiel
const ACCEPT = "image/png, image/jpeg, image/webp";
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,95})?$/;

// Ratio → dimensions (multiples de 32). Le modèle peut les limiter ou les ajuster : seules les dimensions RÉELLES de l'image reçue sont enregistrées.
export const RATIO_SIZES: Record<ImageRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 }, "4:5": { width: 896, height: 1120 }, "3:4": { width: 896, height: 1152 }, "16:9": { width: 1344, height: 768 }, "9:16": { width: 768, height: 1344 },
};
// Précision de style ajoutée côté serveur au prompt (déjà modéré en amont).
const STYLE_HINT: Record<ImageStyle, string> = {
  realistic: "realistic photography, natural light", cinematic: "cinematic still, dramatic lighting, film grain", anime: "anime illustration style", "3d": "3D render, detailed materials",
  illustration: "digital illustration", painting: "oil painting style, visible brushwork", dark_fantasy: "dark fantasy art, moody atmosphere", minimalist: "minimalist composition, clean background",
};
export const buildPrompt = (req: ImageRequest) => `${req.prompt}\n\nStyle: ${STYLE_HINT[req.style]}`;
export const modelUrl = (model: string) => ROUTER + model.split("/").map(encodeURIComponent).join("/");

interface Shot extends InspectedImage { bytes: Uint8Array }

export class HuggingFaceImage implements ImageProvider {
  readonly id = "huggingface";
  constructor(private readonly apiKey: string, private readonly model: string) {}

  // Une image par appel (l'API ne produit qu'une image par requête) ; `count` appels en parallèle. TOUT est validé avant de stocker quoi que ce soit.
  async generate(req: ImageRequest, opts?: { signal?: AbortSignal; userId?: string; generationId?: string }): Promise<ImageJob> {
    const signal = opts?.signal;
    if (!opts?.userId || !opts.generationId) throw new ProviderError("PROVIDER_MISCONFIGURED", "hf_no_context"); // sans identifiants serveur, pas de chemin de stockage possible
    if (!MODEL_RE.test(this.model) || this.model.includes("..")) throw new ProviderError("PROVIDER_MISCONFIGURED", "hf_model_name");
    if (!getStorageProvider()) throw new ProviderError("PROVIDER_MISCONFIGURED", "hf_no_storage");

    const shots = await Promise.all(Array.from({ length: req.count }, () => this.render(req, signal)));

    const stored: string[] = [];
    const images: ImageAsset[] = [];
    try {
      for (const s of shots) {
        if (signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "hf_aborted_before_store"); // le délai est dépassé : on ne range plus rien
        const r = await persistBytes({ userId: opts.userId, generationId: opts.generationId, bytes: s.bytes, mime: s.mime, ext: s.ext });
        stored.push(r.path);
        images.push({ url: r.storedUrl, storedUrl: r.storedUrl, mimeType: s.mime, width: s.width, height: s.height });
      }
    } catch (e) {
      await discardStored(stored); // jamais de fichier orphelin après un échec partiel
      throw e instanceof ProviderError ? e : new ProviderError("GENERATION_FAILED", "hf_storage_failed"); // panne de NOTRE stockage : pas de réessai (ce serait un second appel payant)
    }
    return { status: "completed", result: { images } };
  }

  private async render(req: ImageRequest, signal?: AbortSignal): Promise<Shot> {
    const size = RATIO_SIZES[req.ratio];
    const { bytes, contentType } = await providerFetchBytes(modelUrl(this.model), {
      method: "POST", signal, accept: ACCEPT, headers: { Authorization: `Bearer ${this.apiKey}` },
      body: { inputs: buildPrompt(req), parameters: { width: size.width, height: size.height } },
    }, { maxBytes: MAX_IMAGE_BYTES });
    const info = inspectImageBytes(bytes, MAX_IMAGE_BYTES); // type réel par les octets, troncature, dimensions
    assertDeclaredMime(contentType, info.mime);             // un type annoncé qui contredit les octets est refusé
    return { ...info, bytes };
  }

  // Test de santé SANS génération, SANS prompt, SANS crédit : lecture du compte lié au jeton. Valide le jeton ; ne prouve NI la permission « Inference Providers » NI la disponibilité du modèle.
  async healthCheck(opts?: { signal?: AbortSignal }): Promise<{ ok: boolean }> {
    const r = await providerFetchJson(WHOAMI, { method: "GET", signal: opts?.signal, headers: { Authorization: `Bearer ${this.apiKey}` } });
    return { ok: !!r && typeof r === "object" };
  }
}
