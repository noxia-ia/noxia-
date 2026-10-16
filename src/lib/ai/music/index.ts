import { getProviderChain } from "@/lib/providers/registry";
import type { MusicProvider } from "./types";
export * from "./types";
export function getMusicProvider(): MusicProvider | null { return getProviderChain("music")[0]?.provider ?? null; }
