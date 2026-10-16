import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluatePolicy, getContentPolicyMode } from "./policy";
import type { BlockReason, ModerationInput, ModerationResult } from "./types";

const MAX_BLOCKED_PER_HOUR = 5; // au-delà : pause temporaire (reformulations répétées après refus)

// Point d'entrée UNIQUE de la modération (serveur). À appeler après le contrôle d'âge et la validation, AVANT crédits et fournisseur.
// Journal : module + raison uniquement (jamais le prompt). Sans SUPABASE_SECRET_KEY, les règles restent actives ; journal et pause sont ignorés.
export async function moderateGenerationRequest(input: ModerationInput, userId: string): Promise<ModerationResult> {
  const paramText = input.params && typeof input.params === "object"
    ? Object.values(input.params as Record<string, unknown>).filter((v): v is string => typeof v === "string").join(" ") : "";
  const verdict = evaluatePolicy([input.prompt, input.context ?? "", paramText].join("\n"), getContentPolicyMode());
  if (!verdict.allowed) { await recordBlock(userId, input.module, verdict.reason); return verdict; }
  if ((await recentBlocks(userId)) >= MAX_BLOCKED_PER_HOUR) return { allowed: false, reason: "repeated_attempts", internal: "cooldown" };
  return verdict;
}
async function recordBlock(userId: string, module: ModerationInput["module"], reason: BlockReason) {
  try { await createAdminClient().from("safety_events").insert({ user_id: userId, module, reason }); } catch { /* journal facultatif */ }
}
async function recentBlocks(userId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await createAdminClient().from("safety_events").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    return count ?? 0;
  } catch { return 0; }
}
