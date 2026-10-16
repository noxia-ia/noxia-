"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateRegister, authErrorMessage } from "@/lib/validation";
import { parsePreferences } from "@/lib/locale";
import { parseDateParts, getAgeStatus, UNDERAGE_REGISTER_MESSAGE } from "@/lib/safety/age";
import type { AuthFormState } from "@/lib/auth-types";

const err = (message: string): AuthFormState => ({ status: "error", message });

// Inscription 100 % serveur : l'âge est calculé ici, AVANT toute création de compte. (La base refuse aussi les < 15 ans : migration 0008.)
// Rien n'est journalisé : ni mot de passe, ni date de naissance.
export async function registerAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const invalid = validateRegister(name, email, password, String(fd.get("confirm") ?? ""));
  if (invalid) return err(invalid);
  const dob = parseDateParts(fd.get("dobDay"), fd.get("dobMonth"), fd.get("dobYear"));
  if (!dob) return err("Date de naissance invalide.");
  if (fd.get("ageConfirm") !== "on") return err("Tu dois confirmer ton âge pour créer un compte.");
  if (getAgeStatus(dob) === "restricted") return err(UNDERAGE_REGISTER_MESSAGE); // aucun compte créé

  const ref = String(fd.get("ref") ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).toUpperCase(); // code de parrainage : revalidé par la base
  const prefs = parsePreferences(fd, true); // pays obligatoire ; valeurs revalidées côté serveur
  if (!prefs.ok) return err(prefs.message);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name, ...(ref ? { ref } : {}), date_of_birth: dob, country_code: prefs.value.country, locale: prefs.value.locale, display_currency: prefs.value.currency }, emailRedirectTo: host ? `${proto}://${host}/auth/callback` : undefined },
  });
  if (error) return err(authErrorMessage(error.message));
  if (data.user && data.user.identities?.length === 0) return err("Cette adresse email est déjà utilisée.");
  if (data.session) redirect("/dashboard");
  return { status: "success", message: "Compte créé avec succès. Vérifie ta boîte mail pour confirmer ton adresse." };
}
