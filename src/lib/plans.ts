import type { Plan } from "@/types/database";
// Métadonnées STATIQUES des plans (nom, description, durée, crédits). Packs de crédits : STARTER (id « plus ») 100 crédits, PRO 250, MAX (id « ultra ») 750 ; crédits valables 60 jours (migration 0054). Les identifiants plus/pro/ultra restent inchangés en base. Les PRIX ne sont plus ici : ils vivent en base (table plan_prices,
// voir src/lib/pricing.ts) afin que l'Admin puisse les modifier sans toucher au frontend.
// kind : free = gratuit ; tier = niveau d'offre actuel (durée et crédits « à définir » : rien n'est garanti au-delà de ce qui est affiché) ;
//        duration = ancienne formule à durée fixe, CONSERVÉE (abonnements existants, activation admin) mais non proposée publiquement.
export interface PlanConfig {
  id: Plan; name: string; kind: "free" | "tier" | "duration";
  durationDays: number | null;
  credits: number | null;
  description: string; features: string[];
}
const TIER_FEATURES = ["Accès aux capacités NOXIA disponibles", "Crédits et limites détaillés : à définir"];
export const PLANS: Record<Plan, PlanConfig> = {
  free:    { id: "free",    name: "NOXIA FREE",    kind: "free", durationDays: null, credits: null, description: "Découvre NOXIA avec les Daily Credits.", features: ["Compte et espace personnel", "Daily Credits : récompense quotidienne", "Accès aux capacités disponibles"] },
  plus:    { id: "plus",    name: "NOXIA STARTER", kind: "tier", durationDays: 60, credits: 100, description: "100 crédits, valables 60 jours.", features: ["100 crédits inclus", "Crédits consommés selon les créations", "Valables 60 jours à partir de l'achat", "Les crédits épuisés peuvent être rachetés ou gagnés via les récompenses disponibles"] },
  pro:     { id: "pro",     name: "NOXIA PRO", kind: "tier", durationDays: 60, credits: 250, description: "250 crédits, valables 60 jours.", features: ["250 crédits inclus", "Crédits consommés selon les créations", "Valables 60 jours à partir de l'achat", "Les crédits épuisés peuvent être rachetés ou gagnés via les récompenses disponibles"] },
  ultra:   { id: "ultra",   name: "NOXIA MAX", kind: "tier", durationDays: 60, credits: 750, description: "750 crédits, valables 60 jours.", features: ["750 crédits inclus", "Crédits consommés selon les créations", "Valables 60 jours à partir de l'achat", "Les crédits épuisés peuvent être rachetés ou gagnés via les récompenses disponibles"] },
  daily:   { id: "daily",   name: "NOXIA DAILY",   kind: "duration", durationDays: 1,   credits: null, description: "Un jour d'accès complet.", features: ["Accès aux capacités disponibles", "Valable 1 jour"] },
  weekly:  { id: "weekly",  name: "NOXIA WEEKLY",  kind: "duration", durationDays: 7,   credits: null, description: "Une semaine d'accès complet.", features: ["Accès aux capacités disponibles", "Valable 7 jours"] },
  monthly: { id: "monthly", name: "NOXIA MONTHLY", kind: "duration", durationDays: 30,  credits: null, description: "Un mois d'accès complet.", features: ["Accès aux capacités disponibles", "Valable 30 jours"] },
  annual:  { id: "annual",  name: "NOXIA ANNUAL",  kind: "duration", durationDays: 365, credits: null, description: "Une année d'accès complet.", features: ["Accès aux capacités disponibles", "Valable 365 jours"] },
};
export const PLAN_LIST = Object.values(PLANS);
/** Offres proposées au public (pages /pricing et /dashboard/abonnements). */
export const OFFER_PLAN_IDS = ["free", "plus", "pro", "ultra"] as const satisfies readonly Plan[];
export const OFFER_PLANS = OFFER_PLAN_IDS.map(id => PLANS[id]);
/** Plans activables par l'Admin (niveaux + anciennes formules). */
export const PAID_PLAN_IDS = ["plus", "pro", "ultra", "daily", "weekly", "monthly", "annual"] as const satisfies readonly Plan[];
export function isPaidPlan(v: string): v is (typeof PAID_PLAN_IDS)[number] { return (PAID_PLAN_IDS as readonly string[]).includes(v); }
export function isLegacyPlan(id: Plan) { return PLANS[id].kind === "duration"; }
export function formatDuration(p: PlanConfig) { return p.kind === "free" ? "Illimitée" : !p.durationDays ? "À définir" : p.durationDays === 1 ? "1 jour" : `${p.durationDays} jours`; }
export function formatCredits(p: PlanConfig) { return p.credits === null ? "À définir" : String(p.credits); }
export function addDays(start: Date, days: number) { const d = new Date(start); d.setUTCDate(d.getUTCDate() + days); return d; }
