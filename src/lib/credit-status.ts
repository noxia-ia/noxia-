import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditStatus } from "@/lib/credit-expiry";

// Solde réel + prochaine expiration. L'appel à la fonction SQL credit_status() retire d'abord les crédits échus (validité : 60 jours, migration 0054),
// donc le solde affiché n'inclut jamais de crédits périmés. Si la migration n'est pas encore appliquée, on retombe sur profiles.credits sans date.
export type { CreditStatus } from "@/lib/credit-expiry";

export async function getCreditStatus(supabase: SupabaseClient, fallbackBalance = 0): Promise<CreditStatus> {
  try {
    const { data, error } = await supabase.rpc("credit_status");
    if (error) return { balance: fallbackBalance, nextExpiresAt: null, nextExpiringCredits: 0, expiredNow: 0 };
    const row = (Array.isArray(data) ? data[0] : data) as { balance?: number; next_expires_at?: string | null; next_expiring_credits?: number; expired_now?: number } | null;
    if (!row || typeof row.balance !== "number") return { balance: fallbackBalance, nextExpiresAt: null, nextExpiringCredits: 0, expiredNow: 0 };
    return { balance: row.balance, nextExpiresAt: row.next_expires_at ?? null, nextExpiringCredits: row.next_expiring_credits ?? 0, expiredNow: row.expired_now ?? 0 };
  } catch {
    return { balance: fallbackBalance, nextExpiresAt: null, nextExpiringCredits: 0, expiredNow: 0 };
  }
}
