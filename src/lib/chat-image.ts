import "server-only";
import { generationGateway } from "@/lib/generation-gateway";
import { preflight, settleJob, validateJobWith } from "@/lib/providers/pipeline";
import { executeProvider } from "@/lib/providers/execute";
import { assetHostsOf } from "@/lib/providers/registry";
import { logEvent } from "@/lib/providers/log";
import { persistAsset } from "@/lib/storage";
import { failGeneration } from "@/lib/generations";
import { parseImageResult } from "@/lib/ai/image/validate";
import type { ImageRequest, ImageResult } from "@/lib/ai/image/types";
import { imageCost, IMAGE_CREDIT_COST } from "@/modules/image/config";
import type { ChatImageIntent } from "@/lib/chat-image-intent";

// Crée directement une image à partir d'une demande faite dans le chat. Même chaîne que la page Image : modération, quota, crédits (4 par image),
// fournisseur d'image (IMAGE_PROVIDER), stockage privé, débit seulement si l'image est livrée. Renvoie le texte de la réponse du chat (image incluse).
type PreflightClient = Parameters<typeof preflight>[1]["supabase"]; // même type de client que la page Image (évite tout conflit de versions Supabase)
export type ChatImageResult = { ok: true; reply: string } | { ok: false; message: string };

export async function generateChatImage(ctx: { supabase: PreflightClient; userId: string; intent: ChatImageIntent }): Promise<ChatImageResult> {
  const { supabase, userId, intent } = ctx;
  const req: ImageRequest = { prompt: intent.prompt, style: intent.style, ratio: intent.ratio, quality: "standard", count: 1, format: "png" };
  const cost = imageCost(req.count);
  const pre = await preflight("image", { supabase, userId, prompt: req.prompt, params: req, cost });
  if (!pre.ok) return { ok: false, message: pre.message };

  const { prompt, ...params } = req;
  const admission = await generationGateway.generation({ userId, module: "image", prompt, params, credits: cost });
  if (!admission.id) return { ok: false, message: admission.error === "INSUFFICIENT_CREDITS" ? `Il te faut ${cost} crédits pour créer une image. Tu peux en obtenir dans l'onglet Crédits.` : admission.error === "GENERATION_IN_FLIGHT" ? "Une génération est déjà en cours. Réessaie dans un instant." : "Impossible de lancer la création de l'image. Aucun crédit n'a été débité." };
  const id = admission.id;
  logEvent("generation_started", { module: "image", generationId: id });

  const run = await executeProvider("image", (p, signal) => p.generate(req, { signal, userId, generationId: id }), validateJobWith<ImageResult>(v => parseImageResult(v, req.count)), { generationId: id });
  if (!run.ok) { await failGeneration(id, run.error.code); return { ok: false, message: `${run.error.message} Aucun crédit n'a été débité.` }; }
  const billed = run.value.status === "completed" ? Math.min(cost, IMAGE_CREDIT_COST * run.value.result.images.length) : cost;
  const persist = async (r: ImageResult): Promise<ImageResult> => ({ images: await Promise.all(r.images.map(i => persistAsset(i, { userId, generationId: id, hosts: assetHostsOf("image", run.providerId) }))) });
  const s = await settleJob<ImageResult>({ id, providerId: run.providerId, job: run.value, cost: billed, persist });
  if (s.state === "failed") return { ok: false, message: `${s.message} Aucun crédit n'a été débité.` };
  if (s.state !== "done") return { ok: false, message: "Ton image est en cours de création. Retrouve-la dans la page Image." };
  const first = s.result.images[0];
  const url = first?.storedUrl ?? first?.url;
  if (!url) return { ok: false, message: "L'image n'a pas pu être récupérée. Aucun crédit n'a été débité." };
  return { ok: true, reply: `Voici ton image (${billed} crédits).\n\n![Image créée par NOXIA](${url})` };
}
