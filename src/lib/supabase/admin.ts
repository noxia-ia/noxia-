import "server-only"; // erreur de build si ce fichier est importé depuis un composant client
import { createClient } from "@supabase/supabase-js";

// Client SERVEUR à privilèges élevés. La clé (variable SUPABASE_SECRET_KEY) ne doit JAMAIS porter
// le préfixe NEXT_PUBLIC_. Non utilisé tant qu'aucun moteur IA n'est connecté.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_SECRET_KEY manquante (variable serveur uniquement).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
