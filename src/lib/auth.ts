import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import { getAgeStatus } from "@/lib/safety/age";

export async function getSessionProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle<Profile>();
  return { supabase, user, profile };
}
// Redirige tout compte sans date de naissance vérifiée ou de moins de 15 ans (utilisé par les layouts, en plus du middleware).
export function enforceAge(profile: Profile | null) {
  const s = getAgeStatus(profile?.date_of_birth ?? null);
  if (s === "missing") redirect("/verify-age");
  if (s === "restricted") redirect("/age-restricted");
}
// Contrôle serveur : le rôle est relu en base à chaque appel, jamais depuis le navigateur.
export async function requireAdmin() {
  const s = await getSessionProfile();
  enforceAge(s.profile);
  if (s.profile?.role !== "admin") redirect("/"); // non-admin : retour à l'accueil du site
  return s;
}
