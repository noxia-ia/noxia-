import type { ModuleId } from "@/types";
export type ProviderModule = ModuleId; // code | asmr | video | image | music | agents

// Résultat d'un test de santé : jamais de détail technique ici. Une panne se signale en LANÇANT une ProviderError (temporaire ou non : l'administration les distingue).
export interface HealthCapable { healthCheck?(opts?: { signal?: AbortSignal }): Promise<{ ok: boolean }> }

// Configuration d'un fournisseur : AUCUN secret ici. La clé est lue côté serveur dans la variable nommée par `apiKeyEnv`.
export interface ProviderConfig {
  id: string;                 // identifiant technique [a-z0-9_-], 1 à 40 caractères (valeur de CODE_PROVIDER, IMAGE_PROVIDER…)
  name: string;               // nom affiché dans l'administration
  module: ProviderModule;     // module pris en charge (doit correspondre au module d'enregistrement)
  enabled: boolean;
  model: string;              // modèle fixe (chaîne vide si le fournisseur n'en a qu'un, ou si `modelEnv` est utilisé)
  modelEnv?: string;          // NOM d'une variable serveur contenant le modèle (ex. "OPENROUTER_MODEL_CODE") ; absente ou vide → fournisseur « configuration incomplète », jamais de modèle inventé
  timeoutMs?: number;         // sinon valeur par défaut du module (config.ts)
  maxRetries?: number;        // sinon valeur par défaut (config.ts)
  supportsAsync: boolean;     // peut répondre « processing » + jobId
  supportsPolling: boolean;   // implémente getJob() (obligatoire si supportsAsync)
  apiKeyEnv?: string;         // NOM de la variable serveur (ex. "IMAGE_API_KEY"), jamais sa valeur ; jamais NEXT_PUBLIC_
  userSelectable?: boolean;   // false par défaut : l'utilisateur ne peut pas choisir ce fournisseur
  requiresStorage?: boolean;  // le fournisseur renvoie des OCTETS : il ne fonctionne que si un stockage permanent est configuré (STORAGE_PROVIDER). Sinon : « configuration incomplète » (jamais de data: URL)
  assetHosts?: string[];      // hôtes (HTTPS) d'où viennent les fichiers temporaires de ce fournisseur ; vide = rien n'est téléchargé
}
export interface ProviderContext { apiKey: string | undefined; model: string; timeoutMs: number } // transmis à la fabrique, côté serveur
