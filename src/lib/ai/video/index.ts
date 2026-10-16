import { getProviderChain } from "@/lib/providers/registry";
import type { VideoProvider } from "./types";
export * from "./types";
// Registre central : src/lib/providers/register.ts. Variables serveur : VIDEO_PROVIDER (+ _SECONDARY, _FALLBACK).
export function getVideoProvider(): VideoProvider | null { return getProviderChain("video")[0]?.provider ?? null; }
