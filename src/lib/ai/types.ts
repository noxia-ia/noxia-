import type { HealthCapable } from "@/lib/providers/types";
export const PROJECT_TYPES = ["frontend", "backend", "fullstack", "api", "database", "fix"] as const;
export const TECHNOLOGIES = ["nextjs", "react", "html", "node", "supabase", "typescript"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
export type Technology = (typeof TECHNOLOGIES)[number];

export interface GeneratedFile { path: string; language: string; content: string }
export interface GenerateCodeRequest { prompt: string; projectType: ProjectType; technology: Technology }
export interface GenerateCodeResult { message: string; files: GeneratedFile[] }

// Contrat à implémenter pour brancher un fournisseur IA (exécuté UNIQUEMENT côté serveur).
export interface AIProvider extends HealthCapable {
  readonly id: string;
  generateCode(req: GenerateCodeRequest, opts?: { signal?: AbortSignal }): Promise<GenerateCodeResult>;
}
export type CodeProvider = AIProvider; // alias : AIProvider est l'interface du module Code
