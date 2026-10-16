"use server";
import { generationGateway } from "@/lib/generation-gateway";
import { revalidatePath } from "next/cache";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { parseASMRForm, parseASMRParams, parseASMRResult } from "@/lib/ai/asmr/validate";
import type { ASMRResult } from "@/lib/ai/asmr/types";
import { preflight, settleJob, validateJobWith } from "@/lib/providers/pipeline";
import { executeProvider } from "@/lib/providers/execute";
import { asmrEngineFor } from "@/lib/providers/asmr-engines";
import { getProviderChain, assetHostsOf } from "@/lib/providers/registry";
import { USER_MESSAGES, isTransient } from "@/lib/providers/errors";
import { logEvent } from "@/lib/providers/log";
import { persistAsset, persistBytes } from "@/lib/storage";
import { failGeneration, claimPoll } from "@/lib/generations";
import { UUID_RE } from "@/lib/validation";
import { asmrCost } from "@/modules/asmr/config";
import type { ASMRActionState } from "@/modules/asmr/types";

const fail = (message: string): ASMRActionState => ({ status: "error", message });
const persistASMR = (ctx: { userId: string; generationId: string; hosts: string[] }) => async (r: ASMRResult): Promise<ASMRResult> => {
  if (r.asset.bytes) {
    const ext = r.asset.extension ?? "mp3";
    const stored = await persistBytes({ userId: ctx.userId, generationId: ctx.generationId, bytes: r.asset.bytes, mime: r.asset.mimeType, ext });
    return { asset: { ...r.asset, bytes: undefined, extension: undefined, url: stored.storedUrl, storedUrl: stored.storedUrl } };
  }
  return { asset: await persistAsset(r.asset as ASMRResult["asset"] & { url: string }, ctx) };
};

export async function generateASMRAction(_prev: ASMRActionState, formData: FormData): Promise<ASMRActionState> {
  const gate = await requireAgeVerifiedUser(); // 1) session 2) âge ≥ 15
  if (!gate.ok) return fail(AGE_DENIED_MESSAGE);
  const { supabase, user } = gate;
  const parsed = parseASMRForm(formData);
  if (!parsed.ok) return fail(parsed.error);
  const { req } = parsed;
  if (req.type !== "video" && req.type !== "audio") return fail("ASMR est disponible en vidéo ou en audio.");
  // Routage par type : audio → moteur audio, vidéo → moteur vidéo (indépendant de ASMR_PROVIDER ; clé, modèle et stockage doivent être présents).
  const engineId = asmrEngineFor(req.type);
  const cost = asmrCost(req.type, req.durationSeconds); // coût calculé côté serveur uniquement

  const pre = await preflight("asmr", { supabase, userId: user.id, prompt: req.prompt, params: req, cost, onlyId: engineId });
  if (!pre.ok) return { status: pre.kind, message: pre.message };

  const { prompt, ...params } = req;
  const admission = await generationGateway.generation({ userId: user.id, module: "asmr", prompt, params, credits: cost });
  if (!admission.id) return fail(admission.error === "INSUFFICIENT_CREDITS" ? "Crédits insuffisants. Choisis un abonnement pour continuer." : admission.error === "GENERATION_IN_FLIGHT" ? "Une génération est déjà en cours." : "Impossible d\'enregistrer ta demande. Réessaie.");
  const id = admission.id;
  logEvent("generation_started", { module: "asmr", generationId: id });

  const run = await executeProvider("asmr", (p, signal) => p.generate(req, { signal, userId: user.id, generationId: id }), validateJobWith<ASMRResult>(v => parseASMRResult(v)), { onlyId: engineId, generationId: id });
  if (!run.ok) { await failGeneration(id, run.error.code); revalidatePath("/dashboard/asmr"); return fail(`${run.error.message} Aucun crédit n'a été débité.`); }
  const s = await settleJob<ASMRResult>({ id, providerId: run.providerId, job: run.value, cost, persist: persistASMR({ userId: user.id, generationId: id, hosts: assetHostsOf("asmr", run.providerId) }) });
  revalidatePath("/dashboard/asmr");
  if (s.state === "failed") return fail(`${s.message} Aucun crédit n'a été débité.`);
  if (s.state === "processing") return { status: "processing", message: "Ta création est en cours. Retrouve-la dans l'historique." };
  if (s.state === "already_done") return { status: "processing", message: "Ta création est prête. Retrouve-la dans l'historique." };
  const now = new Date().toISOString();
  return { status: "success", display: { id, prompt, params, status: "completed", createdAt: now, completedAt: now, error: null, result: s.result } };
}

// Suivi (polling) d'un job asynchrone : le client ne fournit que l'identifiant ; le résultat vient du fournisseur, côté serveur.
// Utilise le fournisseur ENREGISTRÉ sur la génération. Le débit n'a lieu qu'à la finalisation d'un résultat validé (atomique, une seule fois).
export async function refreshASMRJobAction(generationId: string): Promise<{ message: string }> {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return { message: AGE_DENIED_MESSAGE };
  const { supabase, user } = gate;
  if (!UUID_RE.test(generationId)) return { message: "Identifiant invalide." };
  const { data: g } = await supabase.from("generations").select("id,status,provider,provider_job_id,params")
    .eq("id", generationId).eq("user_id", user.id).eq("module", "asmr")
    .maybeSingle<{ id: string; status: string; provider: string | null; provider_job_id: string | null; params: unknown }>();
  const params = g ? parseASMRParams(g.params) : null;
  if (!g || !params || g.status !== "processing" || !g.provider_job_id || !g.provider) return { message: "Cette création ne peut pas être actualisée." };
  if (!getProviderChain("asmr", { onlyId: g.provider })[0]?.provider.getJob) return { message: USER_MESSAGES.NO_PROVIDER };
  if (!(await claimPoll(g.id))) return { message: "Patiente quelques secondes avant d'actualiser." }; // un seul appel au fournisseur toutes les 5 s

  const jobId = g.provider_job_id;
  const run = await executeProvider("asmr", (p, signal) => p.getJob!(jobId, { signal }), validateJobWith<ASMRResult>(v => parseASMRResult(v)), { onlyId: g.provider, generationId: g.id });
  if (!run.ok) {
    if (isTransient(run.error.code)) return { message: run.error.message }; // panne passagère : la génération reste « en cours »
    await failGeneration(g.id, run.error.code, g.provider); revalidatePath("/dashboard/asmr");
    return { message: `${run.error.message} Aucun crédit n'a été débité.` };
  }
  const s = await settleJob<ASMRResult>({ id: g.id, providerId: g.provider, jobId, job: run.value, cost: asmrCost(params.type, params.durationSeconds), persist: persistASMR({ userId: user.id, generationId: g.id, hosts: assetHostsOf("asmr", g.provider) }) });
  revalidatePath("/dashboard/asmr");
  if (s.state === "already_done") return { message: "Cette création est déjà terminée." };
  if (s.state === "processing") return { message: "Toujours en cours de création." };
  if (s.state === "failed") return { message: `${s.message} Aucun crédit n'a été débité.` };
  return { message: "Ta création est prête." };
}
