import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleId } from "@/types";
import { createGeneration, type GenerationAdmission } from "@/lib/generations";
import { addPendingAssistant, type AgentAdmission } from "@/lib/agent-chat";
import { ttsCreditCost, sttCreditCost, generationCreditCost, type GenerationCostModule } from "@/lib/generation-costs";

/**
 * NOXIA Phase 1 — single server entry point for generation-credit admission.
 *
 * This is intentionally a thin gateway: existing atomic SQL reservations remain
 * the source of truth. UI code may estimate a price, but this gateway never
 * trusts a browser-provided balance.
 */
export const generationGateway = {
  async generation(input: {
    userId: string;
    module: ModuleId;
    prompt: string;
    params?: unknown;
    projectType?: string;
    technology?: string;
    credits: number;
  }): Promise<GenerationAdmission> {
    // The amount persisted in the reservation is derived again here from the
    // server-side source of truth. The caller's amount is only an assertion;
    // it can never choose a cheaper reservation by changing form data.
    const costModule = input.module as GenerationCostModule;
    let expected: number;
    try {
      expected = generationCreditCost(costModule, input.params);
    } catch {
      return { id: null, error: "INVALID_CREDIT_COST" };
    }
    if (!Number.isInteger(input.credits) || input.credits !== expected) {
      return { id: null, error: "INVALID_CREDIT_COST" };
    }
    return createGeneration({ ...input, credits: expected });
  },

  agent(input: {
    conversationId: string;
    userId: string;
    provider: string;
    credits: number;
  }): Promise<AgentAdmission> {
    return addPendingAssistant(input.conversationId, input.userId, input.provider, input.credits);
  },

  async reserveVoice(input: {
    supabase: SupabaseClient;
    kind: "tts" | "stt";
    amount: number;
    dailyLimit?: number;
  }): Promise<{ id: string } | { id: null; code: "INSUFFICIENT_CREDITS" | "DAILY_LIMIT" | "ERROR" }> {
    const { data, error } = await input.supabase.rpc("reserve_voice_credit", {
      p_kind: input.kind,
      p_amount: input.amount,
      p_daily_limit: input.dailyLimit ?? 60,
    });
    if (!error && typeof data === "string") return { id: data };
    const message = String(error?.message ?? "");
    if (message.includes("voice_daily_limit")) return { id: null, code: "DAILY_LIMIT" };
    if (message.includes("insufficient_credits")) return { id: null, code: "INSUFFICIENT_CREDITS" };
    return { id: null, code: "ERROR" };
  },

  releaseVoice(supabase: SupabaseClient, reservationId: string) {
    return supabase.rpc("release_voice_credit", { p_reservation_id: reservationId });
  },

  finalizeVoice(supabase: SupabaseClient, reservationId: string) {
    return supabase.rpc("finalize_voice_credit", { p_reservation_id: reservationId });
  },
};

export function voiceTtsCost(text: string): number {
  return ttsCreditCost(text);
}

export function voiceSttCost(durationSeconds: number): number {
  return sttCreditCost(durationSeconds);
}
