import "server-only";
import { getSessionProfile } from "@/lib/auth";
import { getAgeStatus } from "./age";

// Contrôle d'âge SERVEUR commun à toutes les actions sensibles. Source de vérité : profiles.date_of_birth en base.
// Ne lit AUCUNE valeur venant du navigateur (âge, isAdult, cookie, localStorage, formulaire).
// Non connecté → redirection /login. Retourne ok:false si la date manque ou si l'âge < 15.
export async function requireAgeVerifiedUser() {
  const { supabase, user, profile } = await getSessionProfile();
  const status = getAgeStatus(profile?.date_of_birth ?? null);
  if (!profile || status !== "ok") return { ok: false as const, reason: status === "restricted" ? ("restricted" as const) : ("missing" as const) };
  return { ok: true as const, supabase, user, profile };
}
