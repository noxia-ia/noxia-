// Source de vérité UNIQUE pour la langue, le pays et la devise d'affichage de l'utilisateur.
// Pour ajouter une langue : passer enabled à true ET ajouter son dictionnaire dans src/lib/i18n/messages.ts.
// Pour ajouter une devise : l'ajouter ici ET créer une migration qui remplace profiles_display_currency_check / plan_prices.

export const LOCALES = [
  { code: "fr", label: "Français", enabled: true },
  { code: "en", label: "English", enabled: true },
  { code: "es", label: "Español", enabled: false },
  { code: "pt", label: "Português", enabled: false },
  { code: "de", label: "Deutsch", enabled: false },
  { code: "ar", label: "العربية", enabled: false },
  { code: "zh", label: "中文", enabled: false },
  { code: "ja", label: "日本語", enabled: false },
  { code: "ko", label: "한국어", enabled: false },
] as const;
export type LocaleCode = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: LocaleCode = "fr";
export const ENABLED_LOCALES = LOCALES.filter(l => l.enabled);
export function isEnabledLocale(v: unknown): v is LocaleCode { return typeof v === "string" && ENABLED_LOCALES.some(l => l.code === v); }
/** Valeur inconnue ou pas encore activée → langue par défaut. */
export function normalizeLocale(v: unknown): LocaleCode { return isEnabledLocale(v) ? v : DEFAULT_LOCALE; }

export const CURRENCIES = [
  { code: "XOF", label: "FCFA (XOF)", suffix: "FCFA", minorDigits: 0 },
  { code: "USD", label: "USD ($)", suffix: "$", minorDigits: 2 },
  { code: "EUR", label: "EUR (€)", suffix: "€", minorDigits: 2 },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export const DEFAULT_CURRENCY: CurrencyCode = "XOF";
export function isCurrency(v: unknown): v is CurrencyCode { return typeof v === "string" && CURRENCIES.some(c => c.code === v); }
export function normalizeCurrency(v: unknown): CurrencyCode { return isCurrency(v) ? v : DEFAULT_CURRENCY; }

/** Montant monétaire robuste : entier en unités mineures + devise. Jamais du texte. */
export interface Money { amountMinor: number; currency: CurrencyCode }
/** Affichage d'un montant DANS SA devise. Aucune conversion de devise n'est faite ici (aucune source de taux n'existe encore). */
export function formatMoney(m: Money, locale: LocaleCode = DEFAULT_LOCALE): string {
  const cur = CURRENCIES.find(c => c.code === m.currency)!;
  const value = m.amountMinor / 10 ** cur.minorDigits;
  const num = value.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { minimumFractionDigits: cur.minorDigits, maximumFractionDigits: cur.minorDigits });
  return m.currency === "XOF" ? `${num} FCFA` : m.currency === "USD" ? `$${num}` : `${num} €`;
}

// Codes ISO 3166-1 alpha-2. Les noms sont obtenus via Intl.DisplayNames (localisés), jamais écrits à la main.
export const COUNTRY_CODES: readonly string[] = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const COUNTRY_SET = new Set(COUNTRY_CODES);
export function isCountryCode(v: unknown): v is string { return typeof v === "string" && COUNTRY_SET.has(v); }
export function countryName(code: string, locale: LocaleCode = DEFAULT_LOCALE): string {
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code; } catch { return code; }
}
/** Liste triée pour un <select>. Pays les plus probables d'abord (Afrique de l'Ouest), puis ordre alphabétique localisé. */
const PRIORITY = ["TG", "BJ", "CI", "GH", "NG", "SN", "BF", "ML", "NE", "FR"];
export function countryOptions(locale: LocaleCode = DEFAULT_LOCALE): { value: string; label: string }[] {
  const all = COUNTRY_CODES.map(c => ({ value: c, label: countryName(c, locale) }));
  const head = PRIORITY.map(c => all.find(o => o.value === c)!);
  const rest = all.filter(o => !PRIORITY.includes(o.value)).sort((a, b) => a.label.localeCompare(b.label, locale));
  return [...head, ...rest];
}

export type PreferenceInput = { country?: string; locale?: LocaleCode; currency?: CurrencyCode };
/** Validation serveur des préférences (la base valide aussi). requireCountry : obligatoire à l'inscription. */
export function parsePreferences(fd: FormData, requireCountry: boolean): { ok: true; value: Required<PreferenceInput> | PreferenceInput } | { ok: false; message: string } {
  const country = String(fd.get("country") ?? "").trim().toUpperCase();
  const locale = String(fd.get("locale") ?? "").trim().toLowerCase();
  const currency = String(fd.get("currency") ?? "").trim().toUpperCase();
  const out: PreferenceInput = {};
  if (country) { if (!isCountryCode(country)) return { ok: false, message: "Pays invalide." }; out.country = country; }
  else if (requireCountry) return { ok: false, message: "Choisis ton pays d'origine." };
  if (locale) { if (!isEnabledLocale(locale)) return { ok: false, message: "Langue non disponible." }; out.locale = locale; }
  if (currency) { if (!isCurrency(currency)) return { ok: false, message: "Devise non disponible." }; out.currency = currency; }
  return { ok: true, value: out };
}
