// « Mes créations » : types, validation et mise en forme. Aucune dépendance serveur : testable seul.
// Les données viennent de la fonction SQL list_creations() (migration 0028) qui applique la RLS ; le fournisseur IA n'est jamais exposé.
import type { SupabaseClient } from "@supabase/supabase-js";

export const CREATION_TABS = [
  { id: "all", label: "Tout" },
  { id: "conversation", label: "Conversations" },
  { id: "code", label: "Code" },
  { id: "image", label: "Images" },
  { id: "video", label: "Vidéos" },
  { id: "audio", label: "Audio" },
  { id: "music", label: "Musique" },
  { id: "asmr", label: "ASMR" },
  { id: "series", label: "Mini-Series" },
] as const;
export type CreationTab = (typeof CREATION_TABS)[number]["id"];
export const PAGE_SIZE = 24;
export function parseTab(v: unknown): CreationTab { return CREATION_TABS.some(t => t.id === v) ? (v as CreationTab) : "all"; }

export type CreationCategory = "conversation" | "code" | "image" | "video" | "audio" | "asmr" | "music";
export type CreationSource = "generation" | "conversation";
export interface CreationRow {
  source: string; id: string; category: string; title: string | null; status: string | null; created_at: string;
  media_url: string | null; mime_type: string | null; agent_id: string | null; agent_name: string | null; file_count: number | null;
}
export interface Creation {
  key: string; source: CreationSource; id: string; category: CreationCategory; typeLabel: string; title: string;
  status: string; statusLabel: string; createdAt: string;
  mediaKind: "image" | "video" | "audio" | null; mediaUrl: string | null; downloadUrl: string | null;
  openHref: string | null; agentName: string | null; fileCount: number | null; deletable: boolean;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const UUID_RE = new RegExp(`^${UUID}$`, "i");
// Seule forme acceptée : route média protégée de NOXIA, chemin <user>/<génération>/<fichier>. Jamais d'URL externe (ni de fournisseur).
const MEDIA_URL_RE = new RegExp(`^/api/media/(image|video|audio)\\?path=${UUID}%2F${UUID}%2F${UUID}\\.(png|jpg|webp|mp4|webm|mp3|wav|ogg|m4a)$`, "i");
export function parseMediaUrl(v: unknown): { url: string; kind: "image" | "video" | "audio" } | null {
  if (typeof v !== "string") return null;
  const m = MEDIA_URL_RE.exec(v);
  return m ? { url: v, kind: m[1].toLowerCase() as "image" | "video" | "audio" } : null;
}

const TYPE_LABELS: Record<CreationCategory, string> = { conversation: "Conversation", code: "Code", image: "Image", video: "Vidéo", audio: "Audio", asmr: "ASMR", music: "Musique" };
const STATUS_LABELS: Record<string, string> = { pending: "En attente", processing: "En cours", completed: "Terminé", failed: "Échec" };
const MODULE_PAGE: Record<CreationCategory, string> = { conversation: "/dashboard/agents", code: "/dashboard/code", image: "/dashboard/image", video: "/dashboard/video", audio: "/dashboard/asmr", asmr: "/dashboard/asmr", music: "/dashboard/music" };
const isCategory = (v: string): v is CreationCategory => v in TYPE_LABELS;

export function toCreation(r: CreationRow): Creation | null {
  if (!UUID_RE.test(r.id) || !isCategory(r.category) || (r.source !== "generation" && r.source !== "conversation") || Number.isNaN(Date.parse(r.created_at))) return null;
  const media = r.source === "generation" ? parseMediaUrl(r.media_url) : null;
  const status = r.status ?? "completed";
  const agentId = r.agent_id && UUID_RE.test(r.agent_id) ? r.agent_id : null;
  const title = (r.title ?? "").trim() || (r.category === "conversation" ? "Conversation" : "Sans titre");
  return {
    key: `${r.source}:${r.id}`, source: r.source, id: r.id, category: r.category, typeLabel: TYPE_LABELS[r.category], title, status,
    statusLabel: STATUS_LABELS[status] ?? "—", createdAt: r.created_at,
    mediaKind: media?.kind ?? null, mediaUrl: media?.url ?? null, downloadUrl: media ? `${media.url}&download=1` : null,
    openHref: media ? media.url : r.source === "conversation" ? (agentId ? `/dashboard/agents/${agentId}?c=${r.id}` : "/dashboard/agents") : MODULE_PAGE[r.category],
    agentName: r.agent_name, fileCount: typeof r.file_count === "number" ? r.file_count : null,
    deletable: r.source === "conversation" || (status !== "pending" && status !== "processing"), // un travail en cours peut encore être facturé : on ne le supprime pas
  };
}
/** Date au jour près, en UTC : identique côté serveur et navigateur (pas d'écart d'hydratation). */
export function formatCreationDate(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { timeZone: "UTC" }); }

// Curseur de pagination (clé composite date + id) : validé strictement, jamais interprété comme du SQL.
const CURSOR_RE = new RegExp(`^(\\d{4}-\\d{2}-\\d{2}T[0-9:.]+(?:Z|[+-]\\d{2}:?\\d{2}))\\|(${UUID})$`, "i");
export const encodeCursor = (c: Pick<Creation, "createdAt" | "id">) => `${c.createdAt}|${c.id}`;
export function parseCursor(v: unknown): { at: string; id: string } | null {
  if (typeof v !== "string" || v.length > 80) return null;
  const m = CURSOR_RE.exec(v);
  return m && !Number.isNaN(Date.parse(m[1])) ? { at: m[1], id: m[2] } : null;
}

export type CreationsPage = { ok: true; items: Creation[]; nextCursor: string | null } | { ok: false };
/** Une page de créations de L'UTILISATEUR DE LA SESSION (la base lit auth.uid()). Aucun user_id n'est passé. */
export async function fetchCreations(supabase: SupabaseClient, tab: CreationTab, cursor: string | null, limit = PAGE_SIZE): Promise<CreationsPage> {
  const c = cursor ? parseCursor(cursor) : null;
  if (cursor && !c) return { ok: false };
  const { data, error } = await supabase.rpc("list_creations", { p_category: tab, p_limit: limit, p_before_at: c?.at ?? null, p_before_id: c?.id ?? null });
  if (error || !Array.isArray(data)) { console.error("list_creations failed", error?.code); return { ok: false }; }
  const hasMore = data.length > limit;
  const items = (data as CreationRow[]).slice(0, limit).map(toCreation).filter((x): x is Creation => x !== null);
  const last = items[items.length - 1];
  return { ok: true, items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}
