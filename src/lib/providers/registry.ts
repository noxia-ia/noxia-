import "server-only"; // le registre n'existe que côté serveur
import type { AIProvider } from "@/lib/ai/types";
import type { ImageProvider } from "@/lib/ai/image/types";
import type { VideoProvider } from "@/lib/ai/video/types";
import type { ASMRProvider } from "@/lib/ai/asmr/types";
import type { AgentProvider } from "@/lib/ai/agents/types";
import type { MusicProvider } from "@/lib/ai/music/types";
import type { ProviderConfig, ProviderContext, ProviderModule } from "./types";
import { DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUTS_MS, MODULE_ENV_PREFIX, PROVIDER_ID_RE } from "./config";
import { registerAll } from "./register";
import { isStorageConfigured } from "@/lib/storage";

export interface ModuleProviders { code: AIProvider; image: ImageProvider; video: VideoProvider; asmr: ASMRProvider; music: MusicProvider; agents: AgentProvider }
export interface ProviderEntry<T> { config: ProviderConfig; create(ctx: ProviderContext): T }
export interface ResolvedProvider<T> { provider: T; config: ProviderConfig; timeoutMs: number; maxRetries: number }
export type ProviderRole = "primary" | "secondary" | "fallback";

const registry: { [M in ProviderModule]: Map<string, ProviderEntry<ModuleProviders[M]>> } = { code: new Map(), image: new Map(), video: new Map(), asmr: new Map(), music: new Map(), agents: new Map() };

// Erreur de DÉVELOPPEUR (jamais montrée à un utilisateur) : une configuration invalide est refusée dès l'enregistrement.
function assertValidConfig(module: ProviderModule, c: ProviderConfig) {
  const fail = (why: string) => { throw new Error(`Fournisseur « ${c.id} » (${module}) invalide : ${why}`); };
  if (!PROVIDER_ID_RE.test(c.id)) fail("id attendu [a-z0-9_-], 1 à 40 caractères");
  if (c.module !== module) fail("config.module doit correspondre au module d'enregistrement");
  if (!c.name.trim()) fail("nom manquant");
  if (c.apiKeyEnv && (!/^[A-Z][A-Z0-9_]*$/.test(c.apiKeyEnv) || c.apiKeyEnv.startsWith("NEXT_PUBLIC_"))) fail("apiKeyEnv doit être un nom de variable SERVEUR (jamais NEXT_PUBLIC_)");
  if (c.modelEnv && (!/^[A-Z][A-Z0-9_]*$/.test(c.modelEnv) || c.modelEnv.startsWith("NEXT_PUBLIC_"))) fail("modelEnv doit être un nom de variable SERVEUR (jamais NEXT_PUBLIC_)");
  if (!c.model && !c.modelEnv) fail("model ou modelEnv requis");
  if (c.supportsAsync && !c.supportsPolling) fail("un fournisseur asynchrone doit implémenter getJob() (supportsPolling: true)");
  if (c.timeoutMs !== undefined && (c.timeoutMs < 1_000 || c.timeoutMs > 900_000)) fail("timeoutMs hors limites (1 s à 15 min)");
  if (c.maxRetries !== undefined && (c.maxRetries < 0 || c.maxRetries > 3)) fail("maxRetries hors limites (0 à 3)");
  for (const h of c.assetHosts ?? []) if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) fail("assetHosts : noms d'hôte seulement (sans https://, sans chemin)");
  if (registry[module].has(c.id)) fail("id déjà enregistré pour ce module");
}
export function registerProvider<M extends ProviderModule>(module: M, entry: ProviderEntry<ModuleProviders[M]>): void {
  assertValidConfig(module, entry.config);
  registry[module].set(entry.config.id, entry);
}
registerAll(registerProvider);

const ROLES: { role: ProviderRole; suffix: string }[] = [{ role: "primary", suffix: "" }, { role: "secondary", suffix: "_SECONDARY" }, { role: "fallback", suffix: "_FALLBACK" }];
export const roleEnvName = (m: ProviderModule, r: ProviderRole) => `${MODULE_ENV_PREFIX[m]}_PROVIDER${ROLES.find(x => x.role === r)!.suffix}`;
// Choix du fournisseur : variables SERVEUR uniquement (jamais une valeur du navigateur).
function envChain(m: ProviderModule): { id: string; role: ProviderRole }[] {
  return ROLES.flatMap(r => { const id = process.env[`${MODULE_ENV_PREFIX[m]}_PROVIDER${r.suffix}`]?.trim(); return id ? [{ id, role: r.role }] : []; });
}
export const getEntry = <M extends ProviderModule>(m: M, id: string) => registry[m].get(id);
const hasKey = (c: ProviderConfig) => !c.apiKeyEnv || !!process.env[c.apiKeyEnv]?.trim();
const modelOf = (c: ProviderConfig) => (c.modelEnv ? process.env[c.modelEnv]?.trim() ?? "" : c.model);
const storageOk = (c: ProviderConfig) => !c.requiresStorage || isStorageConfigured(); // fournisseur qui renvoie des octets : stockage obligatoire
const isComplete = (c: ProviderConfig) => hasKey(c) && !!modelOf(c) && storageOk(c);

function resolve<M extends ProviderModule>(m: M, id: string): ResolvedProvider<ModuleProviders[M]> | null {
  const entry = registry[m].get(id);
  if (!entry || !entry.config.enabled || !isComplete(entry.config)) return null; // clé, modèle OU stockage requis manquant : indisponible, jamais deviné
  const timeoutMs = entry.config.timeoutMs ?? DEFAULT_TIMEOUTS_MS[m];
  const apiKey = entry.config.apiKeyEnv ? process.env[entry.config.apiKeyEnv]?.trim() : undefined;
  const provider = entry.create({ apiKey, model: modelOf(entry.config), timeoutMs });
  if (entry.config.supportsPolling && typeof (provider as unknown as { getJob?: unknown }).getJob !== "function") return null; // déclare le polling sans l'implémenter : inutilisable
  return { provider, config: entry.config, timeoutMs, maxRetries: entry.config.maxRetries ?? DEFAULT_MAX_RETRIES };
}
// Chaîne ordonnée : [choix de l'utilisateur SI le fournisseur est « userSelectable »], principal, secondaire, secours.
// Seuls les fournisseurs ACTIVÉS, ENREGISTRÉS et dont la clé est présente entrent dans la chaîne : aucun faux fournisseur, aucune simulation.
// `onlyId` : restreint à un fournisseur précis (suivi d'un job déjà lancé chez lui).
export function getProviderChain<M extends ProviderModule>(m: M, opts: { preferredId?: string | null; onlyId?: string | null } = {}): ResolvedProvider<ModuleProviders[M]>[] {
  const ids: string[] = [];
  if (opts.onlyId) ids.push(opts.onlyId);
  else {
    const pref = opts.preferredId ? registry[m].get(opts.preferredId) : undefined;
    if (pref?.config.userSelectable) ids.push(pref.config.id);
    envChain(m).forEach(e => ids.push(e.id));
  }
  const out: ResolvedProvider<ModuleProviders[M]>[] = [];
  for (const id of new Set(ids)) { const r = resolve(m, id); if (r) out.push(r); }
  return out;
}
export const assetHostsOf = (m: ProviderModule, id: string): string[] => registry[m].get(id)?.config.assetHosts ?? [];
export const listSelectableIds = (m: ProviderModule) => [...registry[m].values()].filter(e => e.config.enabled && e.config.userSelectable).map(e => e.config.id);

export interface ProviderInfo {
  id: string; name: string; model: string; enabled: boolean; keyPresent: boolean; keyEnvName: string | null; // NOM de la variable, jamais sa valeur
  modelPresent: boolean; modelEnvName: string | null; complete: boolean; // complete = clé, modèle ET (si requis) stockage présents
  storageRequired: boolean; storageReady: boolean;
  supportsAsync: boolean; supportsPolling: boolean; userSelectable: boolean; timeoutMs: number; maxRetries: number; healthCheckAvailable: boolean;
}
export interface RoleInfo { role: ProviderRole; envName: string; configuredId: string | null; registered: boolean; provider: ProviderInfo | null }

// Description SANS secret, pour l'administration : uniquement des booléens, des noms de variables et des réglages.
export function describeModule(m: ProviderModule) {
  const info = (e: ProviderEntry<ModuleProviders[ProviderModule]>): ProviderInfo => {
    const c = e.config;
    const probe = isComplete(c) && c.enabled ? resolve(m, c.id) : null; // fabrique appelée seulement si activé + clé + modèle présents
    return {
      id: c.id, name: c.name, model: modelOf(c), enabled: c.enabled, keyPresent: hasKey(c), keyEnvName: c.apiKeyEnv ?? null,
      modelPresent: !!modelOf(c), modelEnvName: c.modelEnv ?? null, complete: isComplete(c), storageRequired: !!c.requiresStorage, storageReady: storageOk(c),
      supportsAsync: c.supportsAsync, supportsPolling: c.supportsPolling, userSelectable: !!c.userSelectable,
      timeoutMs: c.timeoutMs ?? DEFAULT_TIMEOUTS_MS[m], maxRetries: c.maxRetries ?? DEFAULT_MAX_RETRIES,
      healthCheckAvailable: typeof probe?.provider.healthCheck === "function",
    };
  };
  const assigned = new Map(envChain(m).map(e => [e.role, e.id] as const));
  const roles: RoleInfo[] = ROLES.map(r => {
    const id = assigned.get(r.role) ?? null;
    const entry = id ? registry[m].get(id) : undefined;
    return { role: r.role, envName: roleEnvName(m, r.role), configuredId: id, registered: !!entry, provider: entry ? info(entry) : null };
  });
  const roleIds = new Set(roles.map(r => r.configuredId));
  return {
    roles,
    chainLength: getProviderChain(m).length,
    unassigned: [...registry[m].values()].filter(e => !roleIds.has(e.config.id)).map(info), // enregistrés mais sans rôle (variable *_PROVIDER absente)
  };
}
