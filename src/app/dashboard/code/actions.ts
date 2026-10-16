"use server";
import { generationGateway } from "@/lib/generation-gateway";
import { revalidatePath } from "next/cache";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { parseStoredResult } from "@/lib/ai/result";
import { PROJECT_TYPES, TECHNOLOGIES, type GenerateCodeResult } from "@/lib/ai/types";
import { preflight, settleJob } from "@/lib/providers/pipeline";
import { executeProvider } from "@/lib/providers/execute";
import { ProviderError } from "@/lib/providers/errors";
import { logEvent } from "@/lib/providers/log";
import { failGeneration } from "@/lib/generations";
import { getCurrentSubscription } from "@/lib/subscription";
import { enterCodeQuota, releaseCodeQuota, resolveWindowPlan } from "@/lib/chat-windows";
import { CODE_CREDIT_COST, PROMPT_MIN, PROMPT_MAX } from "@/modules/code/config";
import type { CodeActionState } from "@/modules/code/types";

const fail = (message: string): CodeActionState => ({ status: "error", message });
function isOneOf<T extends readonly string[]>(list: T, v: string): v is T[number] { return (list as readonly string[]).includes(v); }
// Résultat du fournisseur NON FIABLE : structure, tailles et chemins validés avant tout enregistrement.
const validateCode = (raw: GenerateCodeResult): GenerateCodeResult => {
  const r = parseStoredResult(raw);
  if (!r || (!r.message.trim() && r.files.length === 0)) throw new ProviderError("RESULT_INVALID", "code result");
  return r;
};

export async function generateCodeAction(_prev: CodeActionState, formData: FormData): Promise<CodeActionState> {
  const gate = await requireAgeVerifiedUser(); // 1) session 2) âge ≥ 15 : la base est la source de vérité
  if (!gate.ok) return fail(AGE_DENIED_MESSAGE);
  const { supabase, user } = gate;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const projectType = String(formData.get("projectType") ?? "");
  const technology = String(formData.get("technology") ?? "");
  if (prompt.length < PROMPT_MIN) return fail("Décris ta demande en quelques mots de plus.");
  if (prompt.length > PROMPT_MAX) return fail(`Ta demande est trop longue (${PROMPT_MAX} caractères maximum).`);
  if (!isOneOf(PROJECT_TYPES, projectType) || !isOneOf(TECHNOLOGIES, technology)) return fail("Type de projet ou technologie invalide.");

  // 4-5) modération → abonnement → débit de requêtes → fournisseur disponible → crédits. Sans fournisseur : rien n'est écrit, aucun crédit touché.
  const pre = await preflight("code", { supabase, userId: user.id, prompt, params: { projectType, technology }, cost: CODE_CREDIT_COST });
  if (!pre.ok) return { status: pre.kind, message: pre.message };

  // Quota de générations de code (0 crédit) : fenêtre glissante par plan. Libéré si la génération n'aboutit pas.
  const quota = await enterCodeQuota(user.id, resolveWindowPlan(await getCurrentSubscription(supabase, user.id)));
  if (!quota.ok) return fail(quota.message);

  const admission = await generationGateway.generation({ userId: user.id, module: "code", prompt, projectType, technology, credits: CODE_CREDIT_COST });
  if (!admission.id) await releaseCodeQuota(user.id, quota.windowId);
  if (!admission.id) return fail(admission.error === "INSUFFICIENT_CREDITS" ? "Crédits insuffisants. Choisis un abonnement pour continuer." : admission.error === "GENERATION_IN_FLIGHT" ? "Une génération est déjà en cours." : admission.error === "INVALID_CREDIT_COST" ? "Le coût de cette demande est invalide." : "Impossible d\'enregistrer ta demande. Réessaie.");
  const id = admission.id;
  logEvent("generation_started", { module: "code", generationId: id });

  const run = await executeProvider("code", (p, signal) => p.generateCode({ prompt, projectType, technology }, { signal }), validateCode, { generationId: id });
  if (!run.ok) {
    await releaseCodeQuota(user.id, quota.windowId);
    await failGeneration(id, run.error.code);
    revalidatePath("/dashboard/code");
    return fail(`${run.error.message} Aucun crédit n'a été débité.`);
  }
  const s = await settleJob<GenerateCodeResult>({ id, providerId: run.providerId, job: { status: "completed", result: run.value }, cost: CODE_CREDIT_COST });
  revalidatePath("/dashboard/code");
  if (s.state === "already_done") return fail("Cette demande a déjà été traitée. Retrouve-la dans l'historique.");
  if (s.state !== "done") return fail(`${s.state === "failed" ? s.message : USER_ERR} Aucun crédit n'a été débité.`);
  return { status: "success", result: s.result, generationId: id };
}
const USER_ERR = "Erreur inattendue.";
