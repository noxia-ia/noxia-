// Fonctions PURES (utilisables partout, y compris middleware). Jamais d'âge calculé dans un composant React.
export const MIN_AGE = 15;
export type AgeStatus = "ok" | "restricted" | "missing";
export const AGE_RESERVED = "NOXIA AI est réservé aux personnes âgées de 15 ans et plus.";
export const UNDERAGE_REGISTER_MESSAGE = "NOXIA AI est réservé aux utilisateurs âgés de 15 ans et plus. Vous ne pouvez pas créer de compte pour le moment.";
export const VERIFY_REFUSED_MESSAGE = "Accès refusé. NOXIA AI est réservé aux personnes âgées de 15 ans et plus.";
export const AGE_DENIED_MESSAGE = "Accès refusé : votre compte ne satisfait pas les conditions d’âge de NOXIA AI.";

const pad = (n: number) => String(n).padStart(2, "0");
const todayIso = (now: Date) => `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;

// jour/mois/année → "YYYY-MM-DD" valide (31 février refusé, futur refusé) ou null.
export function parseDateParts(day: unknown, month: unknown, year: unknown, now: Date = new Date()): string | null {
  const d = Number(day), m = Number(month), y = Number(year);
  if (![d, m, y].every(Number.isInteger) || y < 1900 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return iso > todayIso(now) ? null : iso;
}
// Âge réel : année, mois, jour ; anniversaire non encore atteint pris en compte (pas de Date.now() - naissance).
export function calculateAge(dob: string, now: Date = new Date()): number | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!mt) return null;
  const [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  const tm = now.getUTCMonth() + 1, td = now.getUTCDate();
  const age = now.getUTCFullYear() - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  return age >= 0 ? age : null;
}
export function getAgeStatus(dob: string | null | undefined, now: Date = new Date()): AgeStatus {
  if (!dob) return "missing";
  const age = calculateAge(dob, now);
  if (age === null) return "missing";
  return age < MIN_AGE ? "restricted" : "ok";
}
