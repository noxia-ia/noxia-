import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MarketingSourceRow {
  code: string;
  label: string;
  channel: string;
  spend_cents: number;
  clicks: number;
  impressions: number;
  signups: number;
  paid_conversions: number;
  ctr_pct: number;
  cvr_pct: number;
  cac_cents: number | null;
  paid_cvr_pct: number;
}

export interface MarketingTotals {
  spend_cents: number;
  clicks: number;
  impressions: number;
  signups: number;
  paid_conversions: number;
}

export interface MarketingAnalytics {
  window_days: number;
  sources: MarketingSourceRow[];
  totals: MarketingTotals;
}

export async function fetchMarketingAnalytics(
  supabase: SupabaseClient,
  days = 30
): Promise<MarketingAnalytics> {
  const { data, error } = await supabase.rpc("admin_marketing_analytics", { p_days: days });
  if (error || !data) {
    return {
      window_days: days,
      sources: [],
      totals: { spend_cents: 0, clicks: 0, impressions: 0, signups: 0, paid_conversions: 0 },
    };
  }
  const o = data as Record<string, unknown>;
  const totals = (o.totals ?? {}) as Record<string, unknown>;
  const sources = Array.isArray(o.sources) ? o.sources : [];
  return {
    window_days: Number(o.window_days) || days,
    sources: sources.map((s: Record<string, unknown>) => ({
      code: String(s.code ?? ""),
      label: String(s.label ?? s.code ?? ""),
      channel: String(s.channel ?? "other"),
      spend_cents: Number(s.spend_cents) || 0,
      clicks: Number(s.clicks) || 0,
      impressions: Number(s.impressions) || 0,
      signups: Number(s.signups) || 0,
      paid_conversions: Number(s.paid_conversions) || 0,
      ctr_pct: Number(s.ctr_pct) || 0,
      cvr_pct: Number(s.cvr_pct) || 0,
      cac_cents: s.cac_cents == null ? null : Number(s.cac_cents),
      paid_cvr_pct: Number(s.paid_cvr_pct) || 0,
    })),
    totals: {
      spend_cents: Number(totals.spend_cents) || 0,
      clicks: Number(totals.clicks) || 0,
      impressions: Number(totals.impressions) || 0,
      signups: Number(totals.signups) || 0,
      paid_conversions: Number(totals.paid_conversions) || 0,
    },
  };
}

export async function upsertMarketingSource(
  supabase: SupabaseClient,
  input: { code: string; label: string; channel: string; active?: boolean }
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("admin_upsert_marketing_source", {
    p_code: input.code,
    p_label: input.label,
    p_channel: input.channel,
    p_active: input.active ?? true,
  });
  if (error) return { ok: false, message: "Impossible d'enregistrer la source." };
  return { ok: true, id: String(data) };
}

export async function addMarketingSpend(
  supabase: SupabaseClient,
  input: {
    sourceCode: string;
    periodStart: string;
    periodEnd: string;
    amountCents: number;
    currency?: string;
    clicks?: number;
    impressions?: number;
    notes?: string;
  }
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { ok: false, message: "Montant invalide." };
  }
  const { data, error } = await supabase.rpc("admin_add_marketing_spend", {
    p_source_code: input.sourceCode,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_amount_cents: input.amountCents,
    p_currency: input.currency ?? "EUR",
    p_clicks: input.clicks ?? 0,
    p_impressions: input.impressions ?? 0,
    p_notes: input.notes ?? null,
  });
  if (error) {
    return {
      ok: false,
      message: error.message.includes("unknown_source")
        ? "Source marketing inconnue."
        : "Impossible d'enregistrer la dépense.",
    };
  }
  return { ok: true, id: String(data) };
}

export function formatCents(cents: number, currency = "EUR"): string {
  const v = cents / 100;
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}
