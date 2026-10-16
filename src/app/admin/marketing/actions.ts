"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { addMarketingSpend, upsertMarketingSource } from "@/lib/admin/marketing";

export type MarketingActionState = { status: "idle" | "ok" | "error"; message?: string };

export async function saveSourceAction(
  _prev: MarketingActionState,
  formData: FormData
): Promise<MarketingActionState> {
  const { supabase } = await requireAdmin();
  const code = String(formData.get("code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const channel = String(formData.get("channel") ?? "other").trim();
  if (!code || !label) return { status: "error", message: "Code et libellé requis." };

  const r = await upsertMarketingSource(supabase, { code, label, channel });
  revalidatePath("/admin/marketing");
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "ok", message: "Source enregistrée." };
}

export async function saveSpendAction(
  _prev: MarketingActionState,
  formData: FormData
): Promise<MarketingActionState> {
  const { supabase } = await requireAdmin();
  const sourceCode = String(formData.get("source_code") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "");
  const periodEnd = String(formData.get("period_end") ?? "");
  const amountEuros = Number(formData.get("amount_euros"));
  const clicks = Number.parseInt(String(formData.get("clicks") ?? "0"), 10) || 0;
  const impressions = Number.parseInt(String(formData.get("impressions") ?? "0"), 10) || 0;
  const currency = String(formData.get("currency") ?? "EUR");
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!sourceCode || !periodStart || !periodEnd) {
    return { status: "error", message: "Source et période requises." };
  }
  if (!Number.isFinite(amountEuros) || amountEuros < 0) {
    return { status: "error", message: "Montant invalide." };
  }

  const r = await addMarketingSpend(supabase, {
    sourceCode,
    periodStart,
    periodEnd,
    amountCents: Math.round(amountEuros * 100),
    currency,
    clicks,
    impressions,
    notes,
  });
  revalidatePath("/admin/marketing");
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "ok", message: "Dépense enregistrée." };
}
