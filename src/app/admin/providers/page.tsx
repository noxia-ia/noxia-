import { requireAdmin } from "@/lib/auth";
import { describeModule, type ProviderInfo, type RoleInfo } from "@/lib/providers/registry";
import { MODULE_TITLES, PROVIDER_MODULES } from "@/lib/providers/config";
import { HEALTH_LABELS, HEALTH_ERROR_MESSAGE, loadLastChecks, type LastCheck } from "@/lib/providers/health";
import type { ProviderModule } from "@/lib/providers/types";
import { describeStorage } from "@/lib/storage";
import { healthCheckAction } from "./actions";

const ROLE_LABELS = { primary: "Principal", secondary: "Secondaire", fallback: "Secours (fallback)" } as const;
type Row = { module: string; provider: string; completed: number; failed: number; timeouts: number; provider_errors: number; credits_used: number };
const yn = (v: boolean, yes: string, no: string) => <span className={v ? "text-emerald-400" : "text-amber-400"}>{v ? yes : no}</span>;
// État affiché : dérivé de la configuration (clé + modèle présents) et du dernier test. Aucun détail sensible.
function connection(p: ProviderInfo | null, registered: boolean, last: LastCheck | undefined): { label: string; ok: boolean } {
  if (!registered || !p || !p.complete) return { label: HEALTH_LABELS.not_configured, ok: false };
  if (!p.enabled) return { label: HEALTH_LABELS.disabled, ok: false };
  if (!last || last.status === "configured") return { label: HEALTH_LABELS.configured, ok: false };
  if (last.status === "ok") return { label: HEALTH_LABELS.ok, ok: true };
  return { label: HEALTH_LABELS[last.status], ok: false };
}
const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

function Details({ mod, p, last }: { mod: ProviderModule; p: ProviderInfo; last: LastCheck | undefined }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-noxia-ash">
      <p className="break-words text-sm text-noxia-silver">{p.name} <span className="text-noxia-ash">· {p.id}</span></p>
      <p>Modèle : {p.modelPresent ? p.model : <span className="text-amber-400">absent{p.modelEnvName ? ` (${p.modelEnvName})` : ""}</span>}{p.supportsAsync ? " · asynchrone" : ""}{p.supportsPolling ? " · suivi (polling)" : ""}{p.userSelectable ? " · choisissable" : ""}</p>
      {p.storageRequired && <p>Stockage des images : {yn(p.storageReady, "prêt", "non configuré (STORAGE_PROVIDER)")} · fournisseur indisponible tant qu'il manque</p>}
      <p>Activé : {yn(p.enabled, "oui", "non")} · Clé : {p.keyEnvName ? yn(p.keyPresent, "présente", "absente") : <span>sans clé requise</span>}{p.keyEnvName && <span className="break-all"> ({p.keyEnvName})</span>}</p>
      <p>Test de santé : {p.healthCheckAvailable ? "disponible" : p.enabled && p.keyPresent ? "non disponible (configuration seulement)" : "indisponible"} · Délai {Math.round(p.timeoutMs / 1000)} s · {p.maxRetries} réessai(s)</p>
      <p>Dernière vérification : {last ? <>{fmt(last.checkedAt)} — {HEALTH_LABELS[last.status]}</> : "aucune"}</p>
      {(last?.status === "error" || last?.status === "temporary_error") && <p role="alert" className="text-noxia-violet">{HEALTH_ERROR_MESSAGE}</p>}
      <form action={healthCheckAction}>
        <input type="hidden" name="module" value={mod} /><input type="hidden" name="provider" value={p.id} />
        <button className="mt-1 min-h-11 w-full rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white sm:w-auto">Tester (sans génération, sans crédit)</button>
      </form>
    </div>
  );
}

function RoleCard({ mod, r, last }: { mod: ProviderModule; r: RoleInfo; last: LastCheck | undefined }) {
  const conn = connection(r.provider, r.registered, last);
  const state = !r.configuredId ? "Non défini" : !r.registered ? "Inconnu : non enregistré dans register.ts" : conn.label;
  const ready = !!r.configuredId && r.registered && conn.ok;
  return (
    <li className="rounded-sm border border-noxia-silver/15 bg-noxia-night p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-noxia-silver">{ROLE_LABELS[r.role]}</p>
        <span className={`text-xs ${ready ? "text-emerald-400" : "text-amber-400"}`}>{state}</span>
      </div>
      <p className="mt-1 break-all text-xs text-noxia-ash">Variable serveur : {r.envName}{r.configuredId ? <> = <span className="text-noxia-silver">{r.configuredId}</span></> : null}</p>
      {r.provider && <Details mod={mod} p={r.provider} last={last} />}
    </li>
  );
}

export default async function AdminProvidersPage() {
  const { supabase } = await requireAdmin();
  const [{ data, error }, { checks, available }] = await Promise.all([supabase.rpc("admin_provider_stats"), loadLastChecks()]); // stats 30 jours : admin uniquement, revérifié en base
  const rows: Row[] = ((data ?? []) as Record<string, unknown>[]).map(r => ({ module: String(r.module), provider: String(r.provider), completed: Number(r.completed), failed: Number(r.failed), timeouts: Number(r.timeouts), provider_errors: Number(r.provider_errors), credits_used: Number(r.credits_used) }));
  const lastOf = (m: string, id: string | null | undefined) => (id ? checks.get(`${m}|${id}`) : undefined);
  return (
    <>
      <h1 className="font-display text-2xl text-noxia-silver sm:text-3xl">Fournisseurs IA</h1>
      <p className="mt-2 text-sm text-noxia-ash">État de la configuration serveur. Les clés ne sont jamais affichées, même en partie : seulement « présente » ou « absente ». Aucun test ne génère ni ne consomme de crédit.</p>
      {!available && <p role="status" className="mt-3 text-xs text-amber-400">Dernières vérifications indisponibles (la migration 0010 a-t-elle été exécutée ?).</p>}
      <div className="mt-6 space-y-4">
        {PROVIDER_MODULES.map(mod => {
          const d = describeModule(mod);
          const mrows = rows.filter(r => r.module === mod);
          return (
            <section key={mod} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg text-noxia-silver sm:text-xl">{MODULE_TITLES[mod]}</h2>
                <span className={`text-sm ${d.chainLength > 0 ? "text-emerald-400" : "text-amber-400"}`}>{d.chainLength > 0 ? `Disponible (${d.chainLength})` : "Indisponible"}</span>
              </div>
              {d.chainLength === 0 && <p className="mt-2 text-sm text-noxia-ash">Aucun fournisseur utilisable : les utilisateurs voient « Aucun fournisseur IA n'est actuellement disponible. » et aucune génération n'est simulée.</p>}
              {(mod === "image" || mod === "video") && (() => { const st = describeStorage(); return <p className="mt-2 text-xs text-noxia-ash">Stockage permanent ({st.envName}) : {yn(st.ready, `prêt (${st.configuredId})`, st.configuredId ? "valeur inconnue" : "non configuré")} · images : bucket public · vidéos : bucket privé + lecture authentifiée</p>; })()}
              <ul className="mt-3 space-y-2">{d.roles.map(r => <RoleCard key={r.role} mod={mod} r={r} last={lastOf(mod, r.configuredId)} />)}</ul>
              {d.unassigned.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-noxia-ash">Enregistrés mais sans rôle (variable *_PROVIDER non renseignée) :</p>
                  <ul className="mt-1 space-y-2">{d.unassigned.map(p => <li key={p.id} className="rounded-sm border border-noxia-silver/15 bg-noxia-night p-3"><Details mod={mod} p={p} last={lastOf(mod, p.id)} /></li>)}</ul>
                </div>
              )}
              {mrows.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-noxia-silver/10 pt-3">
                  <p className="text-xs text-noxia-ash">Activité des 30 derniers jours</p>
                  {mrows.map(r => {
                    const total = r.completed + r.failed;
                    return (
                      <p key={r.provider} className="break-words text-xs text-noxia-ash"><span className="text-noxia-silver">{r.provider}</span> · réussies {r.completed} · échouées {r.failed} ({total ? Math.round((r.completed / total) * 100) : 0} % de succès) · erreurs fournisseur {r.provider_errors} · délais dépassés {r.timeouts} · crédits débités {r.credits_used}</p>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {error && <p className="mt-4 text-sm text-noxia-ash">Statistiques indisponibles (la migration 0009 a-t-elle été exécutée ?).</p>}
      {!error && rows.length === 0 && <p className="mt-4 text-sm text-noxia-ash">Aucune génération sur les 30 derniers jours.</p>}
    </>
  );
}

