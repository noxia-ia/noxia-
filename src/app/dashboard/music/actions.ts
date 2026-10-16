"use server";
import { generationGateway } from "@/lib/generation-gateway";
import { revalidatePath } from "next/cache";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { parseMusicForm, parseMusicResult } from "@/lib/ai/music/validate";
import type { MusicResult } from "@/lib/ai/music/types";
import { preflight, settleJob, validateJobWith } from "@/lib/providers/pipeline";
import { executeProvider } from "@/lib/providers/execute";
import { assetHostsOf } from "@/lib/providers/registry";
import { persistAsset, persistBytes } from "@/lib/storage";
import { failGeneration, claimPoll } from "@/lib/generations";
import { getProviderChain } from "@/lib/providers/registry";
import { USER_MESSAGES, isTransient } from "@/lib/providers/errors";
import { UUID_RE } from "@/lib/validation";
import { musicCost } from "@/modules/music/config";
import type { MusicActionState } from "@/modules/music/types";

const fail = (message: string): MusicActionState => ({ status: "error", message });
const persistMusic = (ctx: { userId: string; generationId: string; hosts: string[] }) => async (r: MusicResult): Promise<MusicResult> => {
  if (r.asset.bytes) {
    const ext = r.asset.extension ?? (r.asset.mimeType === "audio/wav" || r.asset.mimeType === "audio/x-wav" ? "wav" : "mp3");
    const stored = await persistBytes({ userId: ctx.userId, generationId: ctx.generationId, bytes: r.asset.bytes, mime: r.asset.mimeType, ext });
    return { asset: { ...r.asset, bytes: undefined, extension: undefined, url: stored.storedUrl, storedUrl: stored.storedUrl } };
  }
  if (!r.asset.url) throw new Error("music:missing_asset");
  return { asset: await persistAsset(r.asset as MusicResult["asset"] & { url: string }, ctx) };
};

export async function generateMusicAction(_prev: MusicActionState, formData: FormData): Promise<MusicActionState> {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return fail(AGE_DENIED_MESSAGE);
  const { supabase, user } = gate;
  const parsed = parseMusicForm(formData);
  if (!parsed.ok) return fail(parsed.error);
  const { req } = parsed;
  const cost = musicCost(req.durationSeconds);
  const pre = await preflight("music", { supabase, userId: user.id, prompt: req.prompt, params: req, cost });
  if (!pre.ok) return { status: pre.kind, message: pre.message };
  const { prompt, ...params } = req;
  const admission = await generationGateway.generation({ userId: user.id, module: "music", prompt, params, credits: cost });
  if (!admission.id) return fail(admission.error === "INSUFFICIENT_CREDITS" ? "Crédits insuffisants. Choisis un abonnement pour continuer." : admission.error === "GENERATION_IN_FLIGHT" ? "Une génération est déjà en cours." : "Impossible d\'enregistrer ta demande. Réessaie.");
  const id = admission.id;
  const run = await executeProvider("music", (p, signal) => p.generate(req, { signal }), validateJobWith<MusicResult>(v => parseMusicResult(v)), { generationId: id });
  if (!run.ok) { await failGeneration(id, run.error.code); revalidatePath("/dashboard/music"); return fail(`${run.error.message} Aucun crédit n'a été débité.`); }
  let s;
  try { s = await settleJob<MusicResult>({ id, providerId: run.providerId, job: run.value, cost, persist: persistMusic({ userId: user.id, generationId: id, hosts: assetHostsOf("music", run.providerId) }) }); }
  catch { await failGeneration(id, "GENERATION_FAILED", run.providerId); return fail("Impossible d'enregistrer la musique. Aucun crédit n'a été débité."); }
  revalidatePath("/dashboard/music");
  if (s.state === "failed") return fail(`${s.message} Aucun crédit n'a été débité.`);
  if (s.state === "processing") return { status: "processing", message: "Ta musique est en cours de création. Retrouve-la dans Mes créations." };
  if (s.state === "already_done") return { status: "processing", message: "Ta musique est prête. Retrouve-la dans Mes créations." };
  const now = new Date().toISOString();
  return { status: "success", display: { id, prompt, params, status: "completed", createdAt: now, completedAt: now, error: null, result: s.result } };
}


export async function refreshMusicJobAction(generationId: string): Promise<{ message: string }> {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return { message: AGE_DENIED_MESSAGE };
  const { supabase, user } = gate;
  if (!UUID_RE.test(generationId)) return { message: "Identifiant invalide." };
  const { data: g } = await supabase.from("generations").select("id,status,provider,provider_job_id,params").eq("id", generationId).eq("user_id", user.id).eq("module", "music").maybeSingle<{ id: string; status: string; provider: string | null; provider_job_id: string | null; params: unknown }>();
  const params = g ? (await import("@/lib/ai/music/validate")).parseMusicParams(g.params) : null;
  if (!g || !params || g.status !== "processing" || !g.provider_job_id || !g.provider) return { message: "Cette musique ne peut pas être actualisée." };
  if (!getProviderChain("music", { onlyId: g.provider })[0]?.provider.getJob) return { message: USER_MESSAGES.NO_PROVIDER };
  if (!(await claimPoll(g.id))) return { message: "Patiente quelques secondes avant d'actualiser." };
  const run = await executeProvider("music", (p, signal) => p.getJob!(g.provider_job_id!, { signal }), validateJobWith<MusicResult>(v => parseMusicResult(v)), { onlyId: g.provider, generationId: g.id });
  if (!run.ok) {
    if (isTransient(run.error.code)) return { message: run.error.message };
    await failGeneration(g.id, run.error.code, g.provider);
    revalidatePath("/dashboard/music");
    return { message: `${run.error.message} Aucun crédit n'a été débité.` };
  }
  const settled = await settleJob<MusicResult>({ id: g.id, providerId: g.provider, jobId: g.provider_job_id, job: run.value, cost: musicCost(params.durationSeconds), persist: persistMusic({ userId: user.id, generationId: g.id, hosts: assetHostsOf("music", g.provider) }) });
  revalidatePath("/dashboard/music");
  if (settled.state === "done") return { message: "Ta musique est prête." };
  if (settled.state === "already_done") return { message: "Cette création est déjà terminée." };
  if (settled.state === "processing") return { message: "Toujours en cours de création." };
  return { message: `${settled.message} Aucun crédit n'a été débité.` };
}
