"use server";
import { createClient } from "@/lib/supabase/server";

// Mémorise le thème choisi avec le bouton ☀/🌙. Les autres préférences ne sont pas modifiées.
// Si aucune préférence n'existe encore, la ligne est créée avec les valeurs par défaut de la base (migration 0047).
export async function setThemeAction(theme: "dark" | "light"): Promise<void> {
  if (theme !== "dark" && theme !== "light") return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: existing } = await supabase.from("user_preferences").select("user_id").eq("user_id", user.id).maybeSingle();
  if (existing) await supabase.from("user_preferences").update({ theme, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  else await supabase.from("user_preferences").insert({ user_id: user.id, theme });
}
