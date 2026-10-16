"use server";
import { generationGateway } from "@/lib/generation-gateway";
import { revalidatePath } from "next/cache";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { parseVideoForm, parseVideoParams, parseVideoResult } from "@/lib/ai/video/validate";
import type { VideoResult } from "@/lib/ai/video/types";
import { preflight, settleJob, validateJobWith, type Settled } from "@/lib/providers/pipeline";
import { executeProvider } from "@/lib/providers/execute";
import { getProviderChain, assetHostsOf } from "@/lib/providers/registry";
import { USER_MESSAGES, isTransient } from "@/lib/providers/errors";
import { logEvent } from "@/lib/providers/log";
import { persistAsset } from "@/lib/storage";
import { failGeneration, claimPoll } from "@/lib/generations";
import { UUID_RE } from "@/lib/validation";
import { videoCost } from "@/modules/video/config";
import type { VideoActionState } from "@/modules/video/types";

const fail = (message: string): VideoActionState => ({ status: "error", message });
const persistVideos = (ctx: { userId: string; generationId: string; hosts: string[] }) => async (r: VideoResult): Promise<VideoResult> => ({ asset: await persistAsset(r.asset, { ...ctx, required: true }) });

export async function generateVideoAction(_prev: VideoActionState, formData: FormData): Promise<VideoActionState> {
  const gate = await requireAgeVerifiedUser(); // 1) session 2) âge ≥ 15
  if (!gate.ok) return fail(AGE_DENIED_MESSAGE);
  const { supabase, user } = gate;
  const parsed = parseVideoForm(formData);
  if (!parsed.ok) return fail(parsed.error);
  const { req } = parsed;
  const cost = videoCost(req); // coût calculé côté serveur uniquement

  const pre = await preflight("video", { supabase, userId: user.id, prompt: req.prompt, params: req, cost });
  if (!pre.ok) return { status: pre.kind, message: pre.message };

  const { prompt, ...params } = req;
  const admission = await generationGateway.generation({ userId: user.id, module: "video", prompt, params, credits: cost });
  if (!admission.id) return fail(admission.error === "INSUFFICIENT_CREDITS" ? "Crédits insuffisants. Choisis un abonnement pour continuer." : admission.error === "GENERATION_IN_FLIGHT" ? "Une génération est déjà en cours." : "Impossible d\'enregistrer ta demande. Réessaie.");
  const id = admission.id;
  logEvent("generation_started", { module: "video", generationId: id });

  const run = await executeProvider("video", (p, signal) => p.generate(req, { signal, userId: user.id, generationId: id }), validateJobWith<VideoResult>(v => parseVideoResult(v)), { generationId: id });
  if (!run.ok) { await failGeneration(id, run.error.code); revalidatePath("/dashboard/video"); return fail(`${run.error.message} Aucun crédit n'a été débité.`); }
  let s: Settled<VideoResult>;
  try {
    s = await settleJob<VideoResult>({ id, providerId: run.providerId, job: run.value, cost, persist: persistVideos({ userId: user.id, generationId: id, hosts: assetHostsOf("video", run.providerId) }) });
  } catch {
    await failGeneration(id, "GENERATION_FAILED", run.providerId);
    revalidatePath("/dashboard/video");
    return fail("Impossible d'enregistrer la vidéo. Aucun crédit n'a été débité.");
  }
  revalidatePath("/dashboard/video");
  if (s.state === "failed") return fail(`${s.message} Aucun crédit n'a été débité.`);
  if (s.state === "processing") return { status: "processing", message: "Ta vidéo est en cours de création. Retrouve-la dans l'historique." };
  if (s.state === "already_done") return { status: "processing", message: "Ta vidéo est prête. Retrouve-la dans l'historique." };
  const now = new Date().toISOString();
  return { status: "success", display: { id, prompt, params, status: "completed", createdAt: now, completedAt: now, error: null, result: s.result } };
}

// Suivi (polling) d'un job asynchrone : le client ne fournit que l'identifiant ; le résultat vient du fournisseur, côté serveur.
// Utilise le fournisseur ENREGISTRÉ sur la génération. Inactif tant qu'aucun fournisseur asynchrone n'est connecté.
export async function refreshVideoJobAction(generationId: string): Promise<{ message: string }> {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return { message: AGE_DENIED_MESSAGE };
  const { supabase, user } = gate;
  if (!UUID_RE.test(generationId)) return { message: "Identifiant invalide." };
  const { data: g } = await supabase.from("generations").select("id,status,provider,provider_job_id,params")
    .eq("id", generationId).eq("user_id", user.id).eq("module", "video")
    .maybeSingle<{ id: string; status: string; provider: string | null; provider_job_id: string | null; params: unknown }>();
  const params = g ? parseVideoParams(g.params) : null;
  if (!g || !params || g.status !== "processing" || !g.provider_job_id || !g.provider) return { message: "Cette vidéo ne peut pas être actualisée." };
  if (!getProviderChain("video", { onlyId: g.provider })[0]?.provider.getJob) return { message: USER_MESSAGES.NO_PROVIDER };

  if (!(await claimPoll(g.id))) return { message: "Patiente quelques secondes avant d'actualiser." }; // un seul appel au fournisseur toutes les 5 s
  const jobId = g.provider_job_id;
  const run = await executeProvider("video", (p, signal) => p.getJob!(jobId, { signal }), validateJobWith<VideoResult>(v => parseVideoResult(v)), { onlyId: g.provider, generationId: g.id });
  if (!run.ok) {
    if (isTransient(run.error.code)) return { message: run.error.message }; // panne passagère : la génération reste « en cours »
    await failGeneration(g.id, run.error.code, g.provider); revalidatePath("/dashboard/video");
    return { message: `${run.error.message} Aucun crédit n'a été débité.` };
  }
  let s: Settled<VideoResult>;
  try {
    s = await settleJob<VideoResult>({ id: g.id, providerId: g.provider, jobId, job: run.value, cost: videoCost(params), persist: persistVideos({ userId: user.id, generationId: g.id, hosts: assetHostsOf("video", g.provider) }) });
  } catch {
    await failGeneration(g.id, "GENERATION_FAILED", g.provider);
    revalidatePath("/dashboard/video");
    return { message: "Impossible d'enregistrer la vidéo. Aucun crédit n'a été débité." };
  }
  revalidatePath("/dashboard/video");
  if (s.state === "already_done") return { message: "Cette création est déjà terminée." };
  if (s.state === "processing") return { message: "Toujours en cours de création." };
  if (s.state === "failed") return { message: `${s.message} Aucun crédit n'a été débité.` };
  return { message: "Ta vidéo est prête." };
}
