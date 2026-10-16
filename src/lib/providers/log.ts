import "server-only";
// Journal technique MINIMAL : liste blanche de champs, jamais de prompt, de clé, de token ni de résultat.
export type LogEvent = "generation_started" | "provider_called" | "provider_failed" | "generation_completed" | "generation_failed" | "generation_blocked" | "generation_timeout" | "maintenance_completed" | "chat_window_unavailable" | "chat_window_release_failed";
const ALLOWED = new Set(["module", "provider", "generationId", "code", "attempt", "durationMs", "expired", "purged", "purgeFailed"]);
export function logEvent(event: LogEvent, fields: Record<string, string | number | undefined> = {}) {
  const safe: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(fields)) if (ALLOWED.has(k) && v !== undefined) safe[k] = typeof v === "string" ? v.slice(0, 80) : v;
  console.info(JSON.stringify({ t: new Date().toISOString(), event, ...safe }));
}
