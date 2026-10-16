import { getProviderChain } from "@/lib/providers/registry";
import type { AIProvider } from "./types";
export * from "./types";
// Registre central : src/lib/providers/register.ts. Variables serveur : CODE_PROVIDER (+ _SECONDARY, _FALLBACK).
export function getProvider(): AIProvider | null { return getProviderChain("code")[0]?.provider ?? null; }
