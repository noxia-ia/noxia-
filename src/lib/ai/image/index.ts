import { getProviderChain } from "@/lib/providers/registry";
import type { ImageProvider } from "./types";
export * from "./types";
// Registre central : src/lib/providers/register.ts. Variables serveur : IMAGE_PROVIDER (+ _SECONDARY, _FALLBACK).
export function getImageProvider(): ImageProvider | null { return getProviderChain("image")[0]?.provider ?? null; }
