import type { ProjectType, Technology } from "@/lib/ai/types";
export const PROJECT_LABELS: Record<ProjectType, string> = { frontend: "Frontend", backend: "Backend", fullstack: "Full Stack", api: "API", database: "Base de données", fix: "Correction de code" };
export const TECH_LABELS: Record<Technology, string> = { nextjs: "Next.js", react: "React", html: "HTML/CSS/JS", node: "Node.js", supabase: "Supabase", typescript: "TypeScript" };
export const SUGGESTIONS: { label: string; projectType: ProjectType; prompt: string }[] = [
  { label: "Générer un site", projectType: "frontend", prompt: "Crée une landing page moderne pour une boutique." },
  { label: "Créer une API", projectType: "api", prompt: "Crée une API REST avec Next.js." },
  { label: "Créer un dashboard", projectType: "fullstack", prompt: "Crée un dashboard d'administration avec des statistiques." },
  { label: "Créer une base de données", projectType: "database", prompt: "Conçois le schéma d'une base de données pour une application de réservation." },
  { label: "Corriger mon code", projectType: "fix", prompt: "Voici mon code, corrige les erreurs :\n\n" },
];
