"use server";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { parseDateParts, getAgeStatus, VERIFY_REFUSED_MESSAGE } from "@/lib/safety/age";
import type { AuthFormState } from "@/lib/auth-types";

const err = (message: string): AuthFormState => ({ status: "error", message });

// Déclaration unique : la date est enregistrée par une fonction SQL qui refuse toute seconde déclaration (pas de nouvel essai).
export async function verifyAgeAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const { supabase, profile } = await getSessionProfile();
  if (!profile) return err("Profil introuvable. Déconnecte-toi puis reconnecte-toi.");
  const current = getAgeStatus(profile.date_of_birth);
  if (current === "ok") redirect("/dashboard");
  if (current === "restricted") redirect("/age-restricted");
  const dob = parseDateParts(fd.get("dobDay"), fd.get("dobMonth"), fd.get("dobYear"));
  if (!dob) return err("Date de naissance invalide.");
  if (fd.get("ageConfirm") !== "on") return err("Tu dois confirmer l'exactitude de ta date de naissance.");
  const { error } = await supabase.rpc("set_date_of_birth", { p_dob: dob });
  if (error && !error.message.includes("already_set")) return err("Impossible d'enregistrer ta date de naissance. Réessaie.");
  if (getAgeStatus(dob) === "restricted") return err(VERIFY_REFUSED_MESSAGE); // les pages suivantes redirigent vers /age-restricted
  redirect("/dashboard");
}
