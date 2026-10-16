import { PERSONALITIES, CREATIVITIES, LANGUAGES, AGENT_STATUSES, AGENT_ICONS } from "./types";
import { LIMITS } from "@/modules/agents/config";
import type { AgentInput } from "@/modules/agents/types";

const inList = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === "string" && (list as readonly string[]).includes(v);

export function parseAgentForm(fd: FormData, providers: readonly string[]): { ok: true; data: AgentInput } | { ok: false; error: string } {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const name = s("name"), description = s("description"), objective = s("objective"), role = s("role"), instructions = s("instructions"), domain = s("domain"), custom = s("personalityCustom"), provider = s("provider");
  const icon = s("icon"), personality = s("personality"), creativity = s("creativity"), language = s("language"), status = s("status");
  if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) return { ok: false, error: `Le nom doit contenir entre ${LIMITS.name.min} et ${LIMITS.name.max} caractères.` };
  if (description.length > LIMITS.description) return { ok: false, error: `La description est limitée à ${LIMITS.description} caractères.` };
  if (objective.length > LIMITS.objective) return { ok: false, error: `L'objectif est limité à ${LIMITS.objective} caractères.` };
  if (role.length < LIMITS.role.min || role.length > LIMITS.role.max) return { ok: false, error: `Le rôle doit contenir entre ${LIMITS.role.min} et ${LIMITS.role.max} caractères.` };
  if (instructions.length < LIMITS.instructions.min || instructions.length > LIMITS.instructions.max) return { ok: false, error: `Les instructions doivent contenir entre ${LIMITS.instructions.min} et ${LIMITS.instructions.max} caractères.` };
  if (domain.length > LIMITS.domain) return { ok: false, error: `Le domaine est limité à ${LIMITS.domain} caractères.` };
  if (custom.length > LIMITS.personalityCustom) return { ok: false, error: `La personnalisation est limitée à ${LIMITS.personalityCustom} caractères.` };
  if (!inList(AGENT_ICONS, icon) || !inList(PERSONALITIES, personality) || !inList(CREATIVITIES, creativity) || !inList(LANGUAGES, language) || !inList(AGENT_STATUSES, status)) return { ok: false, error: "Paramètres invalides." };
  if (provider && !providers.includes(provider)) return { ok: false, error: "Fournisseur IA invalide." };
  return { ok: true, data: { name, description, objective, role, instructions, domain, personality, personalityCustom: custom || null, creativity, language, provider: provider || null, status, icon } };
}

export function sanitizeReply(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 20000) : null;
}
