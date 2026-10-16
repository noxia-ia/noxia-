import { getProviderChain } from "@/lib/providers/registry";
import type { ASMRProvider } from "./types";
export * from "./types";
// Registre central : src/lib/providers/register.ts. Variables serveur : ASMR_PROVIDER (+ _SECONDARY, _FALLBACK).
export function getASMRProvider(): ASMRProvider | null { return getProviderChain("asmr")[0]?.provider ?? null; }
