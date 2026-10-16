"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_BUCKET, VIDEO_BUCKET, AUDIO_BUCKET } from "@/lib/storage/policy";
import { removeAllAttachmentsForUser } from "@/lib/attachments/service";
import { parsePreferences } from "@/lib/locale";
import { PASSWORD_MIN } from "@/lib/validation";
import type { MessageKey } from "@/lib/i18n/messages";

export type SettingsState = { status: "idle" } | { status: "ok"; key: MessageKey } | { status: "error"; key?: MessageKey; message?: string };

export type UserPreferences = {
  theme: "dark" | "light" | "system";
  notifications_enabled: boolean;
  voice_preset: "nova" | "calm" | "warm" | "energetic";
  voice_speed: number;
  voice_autoplay: boolean;
  response_style: "balanced" | "concise" | "creative" | "professional" | "friendly";
  memory_enabled: boolean;
};
const fail = (message: string): SettingsState => ({ status: "error", message });
const failKey = (): SettingsState => ({ status: "error", key: "settings.error" });

// Toutes les actions relisent la session côté serveur : l'identifiant utilisateur ne vient JAMAIS du formulaire.
async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// Nom : colonne autorisée en écriture par la RLS/les privilèges de 0001 (full_name, avatar_url).
export async function saveProfileAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, user } = await session();
  if (!user) return failKey();
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return fail("Le nom doit contenir entre 2 et 80 caractères.");
  const { error } = await supabase.from("profiles").update({ full_name: name }).eq("user_id", user.id);
  if (error) { console.error("saveProfileAction failed", error.code); return failKey(); }
  revalidatePath("/dashboard", "layout");
  return { status: "ok", key: "settings.saved" };
}

// Pays / langue / devise : uniquement via la fonction SQL set_profile_preferences (migration 0026).
export async function saveRegionAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, user } = await session();
  if (!user) return failKey();
  const parsed = parsePreferences(fd, false);
  if (!parsed.ok) return fail(parsed.message);
  const v = parsed.value;
  const { error } = await supabase.rpc("set_profile_preferences", { p_country_code: v.country ?? null, p_locale: v.locale ?? null, p_display_currency: v.currency ?? null });
  if (error) { console.error("set_profile_preferences failed", error.code); return failKey(); }
  revalidatePath("/dashboard", "layout");
  return { status: "ok", key: "settings.saved" };
}

// Mot de passe : Supabase Auth (session courante). Aucun mot de passe n'est journalisé.
export async function changePasswordAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, user } = await session();
  if (!user) return failKey();
  const password = String(fd.get("password") ?? "");
  if (password.length < PASSWORD_MIN) return fail(`Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`);
  if (password !== String(fd.get("confirm") ?? "")) return fail("Les mots de passe ne correspondent pas.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) { console.error("updateUser(password) failed", error.status); return fail("Impossible de changer le mot de passe pour le moment."); }
  return { status: "ok", key: "settings.passwordDone" };
}




export async function savePreferencesAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, user } = await session();
  if (!user) return failKey();

  const allowedThemes = ["dark", "light", "system"] as const;
  const allowedVoices = ["nova", "calm", "warm", "energetic"] as const;
  const allowedStyles = ["balanced", "concise", "creative", "professional", "friendly"] as const;
  const theme = String(fd.get("theme") ?? "dark") as UserPreferences["theme"];
  const voice_preset = String(fd.get("voice_preset") ?? "nova") as UserPreferences["voice_preset"];
  const response_style = String(fd.get("response_style") ?? "balanced") as UserPreferences["response_style"];
  const voice_speed = Number(fd.get("voice_speed") ?? 1);
  const notifications_enabled = fd.get("notifications_enabled") === "on";
  const voice_autoplay = fd.get("voice_autoplay") === "on";
  const memory_enabled = fd.get("memory_enabled") === "on";

  if (!allowedThemes.includes(theme) || !allowedVoices.includes(voice_preset) || !allowedStyles.includes(response_style) ||
      !Number.isFinite(voice_speed) || voice_speed < 0.5 || voice_speed > 2) {
    return fail("Préférences invalides.");
  }

  const { error } = await supabase.rpc("set_user_preferences", {
    p_theme: theme,
    p_notifications_enabled: notifications_enabled,
    p_voice_preset: voice_preset,
    p_voice_speed: voice_speed,
    p_voice_autoplay: voice_autoplay,
    p_response_style: response_style,
    p_memory_enabled: memory_enabled,
  });
  if (error) {
    console.error("savePreferencesAction failed", error.code);
    return failKey();
  }
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");
  return { status: "ok", key: "settings.preferencesSaved" };
}
// Suppression de compte : session authentifiée + confirmation explicite.
// Les médias appartenant au compte sont retirés du stockage serveur avant la suppression
// de l'utilisateur Auth. L'identifiant utilisateur vient uniquement de la session.
export async function deleteAccountAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, user } = await session();
  if (!user) return failKey();
  const confirmation = String(fd.get("confirmation") ?? "").trim();
  if (confirmation !== "SUPPRIMER MON COMPTE") {
    return fail("Pour confirmer, saisis exactement : SUPPRIMER MON COMPTE.");
  }

  try {
    const admin = createAdminClient();
    const { data: assets, error: assetError } = await admin
      .from("stored_assets")
      .select("storage_provider,path,mime_type")
      .eq("user_id", user.id);
    if (assetError) {
      console.error("deleteAccountAction assets lookup failed", assetError.code);
      return fail("Impossible de préparer la suppression du compte.");
    }

    const bucketByKind = [
      [IMAGE_BUCKET, "image"],
      [VIDEO_BUCKET, "video"],
      [AUDIO_BUCKET, "audio"],
    ] as const;

    for (const asset of assets ?? []) {
      if (asset.storage_provider !== "supabase-storage" || typeof asset.path !== "string") continue;
      const mime = String((asset as { mime_type?: unknown }).mime_type ?? "").toLowerCase();
      const match = bucketByKind.find(([bucket]) => {
        if (bucket === IMAGE_BUCKET) return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(asset.path);
        if (bucket === VIDEO_BUCKET) return mime.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(asset.path);
        return mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/i.test(asset.path);
      });
      if (!match) continue;
      const { error } = await admin.storage.from(match[0]).remove([asset.path]);
      if (error) {
        console.error("deleteAccountAction storage cleanup failed", error.message);
        return fail("Impossible de supprimer tous les médias du compte. Aucun compte n'a été supprimé.");
      }
    }

    const attachmentCleanup = await removeAllAttachmentsForUser(user.id); // pièces jointes du chat éventuellement encore stockées
    if (attachmentCleanup.failed > 0) return fail("Impossible de supprimer toutes les pièces jointes du compte. Aucun compte n'a été supprimé.");

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("deleteAccountAction auth deletion failed", deleteError.message);
      return fail("Impossible de supprimer le compte pour le moment.");
    }

    await supabase.auth.signOut();
    return { status: "ok", key: "settings.accountDeleted" };
  } catch (error) {
    console.error("deleteAccountAction failed", error instanceof Error ? error.message : "unknown");
    return fail("Impossible de supprimer le compte pour le moment.");
  }
}
