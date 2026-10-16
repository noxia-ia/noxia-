// Prix des plans : lecture de plan_prices (base). Aucune conversion de devise : un prix dans une autre devise que le FCFA
// n'est affiché que s'il existe comme prix EXPLICITE et ACTIF ; sinon on affiche le prix de référence en FCFA.
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Money, type CurrencyCode, type LocaleCode, isCurrency, normalizeCurrency, formatMoney, DEFAULT_LOCALE } from "./locale";
import type { Plan } from "@/types/database";

export const REFERENCE_CURRENCY: CurrencyCode = "XOF";
export interface PriceRow { plan: string; currency: string; amount_minor: number | string; is_reference?: boolean; active: boolean }
export type PriceBook = Partial<Record<string, Partial<Record<CurrencyCode, Money>>>>;

/** Ne garde que les lignes actives, valides (devise connue, montant entier ≥ 0). bigint peut arriver en chaîne. */
export function buildPriceBook(rows: PriceRow[] | null | undefined): PriceBook {
  const book: PriceBook = {};
  for (const r of rows ?? []) {
    if (!r.active || !isCurrency(r.currency)) continue;
    const amount = Number(r.amount_minor);
    if (!Number.isSafeInteger(amount) || amount < 0) continue;
    (book[r.plan] ??= {})[r.currency] = { amountMinor: amount, currency: r.currency };
  }
  return book;
}
export async function loadPriceBook(supabase: SupabaseClient): Promise<PriceBook> {
  const { data, error } = await supabase.from("plan_prices").select("plan, currency, amount_minor, is_reference, active").eq("active", true);
  if (error) { console.error("loadPriceBook failed", error.code); return {}; }
  return buildPriceBook(data as PriceRow[]);
}

export interface ResolvedPrice { reference: Money; display: Money; sameCurrency: boolean }
/** Prix de référence (FCFA) obligatoire ; devise d'affichage = celle choisie si un prix explicite actif existe, sinon FCFA. */
export function resolvePrice(book: PriceBook, plan: Plan | string, preferred: unknown): ResolvedPrice | null {
  const prices = book[plan];
  const reference = prices?.[REFERENCE_CURRENCY];
  if (!reference) return null; // « Prix à définir » : aucun prix de référence en base
  const display = prices?.[normalizeCurrency(preferred)] ?? reference;
  return { reference, display, sameCurrency: display.currency === reference.currency };
}
export function priceLabel(p: ResolvedPrice | null, locale: LocaleCode = DEFAULT_LOCALE): string {
  if (!p) return locale === "en" ? "Price to be defined" : "Prix à définir";
  if (p.display.amountMinor === 0) return locale === "en" ? "Free" : "Gratuit";
  return formatMoney(p.display, locale);
}
/** Mention du montant de référence quand l'affichage est dans une autre devise. */
export function referenceNote(p: ResolvedPrice | null, locale: LocaleCode = DEFAULT_LOCALE): string | null {
  if (!p || p.sameCurrency || p.reference.amountMinor === 0) return null;
  return `${locale === "en" ? "Reference price" : "Tarif de référence"} : ${formatMoney(p.reference, locale)}`;
}
