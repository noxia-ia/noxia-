"use server";
import { generationGateway } from "@/lib/generation-gateway";
import { revalidatePath } from "next/cache";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { parseImageForm, parseImageParams, parseImageResult } from "@/lib/ai/image/validate";
import type { ImageResult } from "@/lib/ai/image/types";
import { preflight, settleJob, validateJobWith } from "@/lib/providers/pipeline";
import { executeProvider } from "@/lib/providers/execute";
import { getProviderChain, assetHostsOf } from "@/lib/providers/registry";
import { USER_MESSAGES, isTransient } from "@/lib/providers/errors";
import { logEvent } from "@/lib/providers/log";
import { persistAsset } from "@/lib/storage";
import { failGeneration, claimPoll } from "@/lib/generations";
import { UUID_RE } from "@/lib/validation";
import { imageCost, IMAGE_CREDIT_COST } from "@/modules/image/config";
import type { ImageActionState } from "@/modules/image/types";

const fail = (message: string): ImageActionState => ({ status: "error", message });
const persistImages = (ctx: { userId: string; generationId: string; hosts: string[] }) => async (r: ImageResult): Promise<ImageResult> => ({ images: await Promise.all(r.images.map(i => persistAsset(i, ctx))) });

export async function generateImageAction(_prev: ImageActionState, formData: FormData): Promise<ImageActionState> {
  const gate = await requireAgeVerifiedUser(); // 1) session 2) âge ≥ 15
  if (!gate.ok) return fail(AGE_DENIED_MESSAGE);
  const { supabase, user } = gate;
  const parsed = parseImageForm(formData);
  if (!parsed.ok) return fail(parsed.error);
  const { req } = parsed;
  const cost = imageCost(req.count); // coût calculé côté serveur uniquement

  const pre = await preflight("image", { supabase, userId: user.id, prompt: req.prompt, params: req, cost });
  if (!pre.ok) return { status: pre.kind, message: pre.message };

  const { prompt, ...params } = req;
  const admission = await generationGateway.generation({ userId: user.id, module: "image", prompt, params, credits: cost });
  if (!admission.id) return fail(admission.error === "INSUFFICIENT_CREDITS" ? "Crédits insuffisants. Choisis un abonnement pour continuer." : admission.error === "GENERATION_IN_FLIGHT" ? "Une génération est déjà en cours." : "Impossible d\'enregistrer ta demande. Réessaie.");
  const id = admission.id;
  logEvent("generation_started", { module: "image", generationId: id });

  const run = await executeProvider("image", (p, signal) => p.generate(req, { signal, userId: user.id, generationId: id }), validateJobWith<ImageResult>(v => parseImageResult(v, req.count)), { generationId: id });
  if (!run.ok) { await failGeneration(id, run.error.code); revalidatePath("/dashboard/image"); return fail(`${run.error.message} Aucun crédit n'a été débité.`); }
  const billed = run.value.status === "completed" ? Math.min(cost, IMAGE_CREDIT_COST * run.value.result.images.length) : cost; // jamais plus que les images réellement livrées ET validées
  const s = await settleJob<ImageResult>({ id, providerId: run.providerId, job: run.value, cost: billed, persist: persistImages({ userId: user.id, generationId: id, hosts: assetHostsOf("image", run.providerId) }) });
  revalidatePath("/dashboard/image");
  if (s.state === "failed") return fail(`${s.message} Aucun crédit n'a été débité.`);
  if (s.state === "processing") return { status: "processing", message: "Ton image est en cours de création. Retrouve-la dans l'historique." };
  if (s.state === "already_done") return { status: "processing", message: "Ton image est prête. Retrouve-la dans l'historique." };
  const now = new Date().toISOString();
  return { status: "success", display: { id, prompt, params, status: "completed", createdAt: now, completedAt: now, error: null, result: s.result } };
}

// Suivi (polling) d'un job asynchrone : le client ne fournit que l'identifiant ; le résultat vient du fournisseur, côté serveur.
// Utilise le fournisseur ENREGISTRÉ sur la génération. Inactif tant qu'aucun fournisseur asynchrone n'est connecté.
export async function refreshImageJobAction(generationId: string): Promise<{ message: string }> {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return { message: AGE_DENIED_MESSAGE };
  const { supabase, user } = gate;
  if (!UUID_RE.test(generationId)) return { message: "Identifiant invalide." };
  const { data: g } = await supabase.from("generations").select("id,status,provider,provider_job_id,params")
    .eq("id", generationId).eq("user_id", user.id).eq("module", "image")
    .maybeSingle<{ id: string; status: string; provider: string | null; provider_job_id: string | null; params: unknown }>();
  const params = g ? parseImageParams(g.params) : null;
  if (!g || !params || g.status !== "processing" || !g.provider_job_id || !g.provider) return { message: "Cette image ne peut pas être actualisée." };
  if (!getProviderChain("image", { onlyId: g.provider })[0]?.provider.getJob) return { message: USER_MESSAGES.NO_PROVIDER };

  if (!(await claimPoll(g.id))) return { message: "Patiente quelques secondes avant d'actualiser." }; // un seul appel au fournisseur toutes les 5 s
  const jobId = g.provider_job_id;
  const run = await executeProvider("image", (p, signal) => p.getJob!(jobId, { signal }), validateJobWith<ImageResult>(v => parseImageResult(v, params.count)), { onlyId: g.provider, generationId: g.id });
  if (!run.ok) {
    if (isTransient(run.error.code)) return { message: run.error.message }; // panne passagère : la génération reste « en cours »
    await failGeneration(g.id, run.error.code, g.provider); revalidatePath("/dashboard/image");
    return { message: `${run.error.message} Aucun crédit n'a été débité.` };
  }
  const s = await settleJob<ImageResult>({ id: g.id, providerId: g.provider, jobId, job: run.value, cost: imageCost(params.count), persist: persistImages({ userId: user.id, generationId: g.id, hosts: assetHostsOf("image", g.provider) }) });
  revalidatePath("/dashboard/image");
  if (s.state === "already_done") return { message: "Cette création est déjà terminée." };
  if (s.state === "processing") return { message: "Toujours en cours de création." };
  if (s.state === "failed") return { message: `${s.message} Aucun crédit n'a été débité.` };
  return { message: "Ton image est prête." };
}
