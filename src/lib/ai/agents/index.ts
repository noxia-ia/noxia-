import { getProviderChain, listSelectableIds } from "@/lib/providers/registry";
import type { AgentProvider } from "./types";
export * from "./types";
// Registre central : src/lib/providers/register.ts. Variables serveur : AGENT_PROVIDER (+ _SECONDARY, _FALLBACK).
// Fournisseurs que l'utilisateur a le droit de choisir (vide tant qu'aucun n'est déclaré « userSelectable »).
export function listAgentProviders(): string[] { return listSelectableIds("agents"); }
// La préférence stockée sur l'agent n'est honorée que si le fournisseur est enregistré ET sélectionnable.
export function getAgentProvider(preferredId?: string | null): AgentProvider | null { return getProviderChain("agents", { preferredId })[0]?.provider ?? null; }
