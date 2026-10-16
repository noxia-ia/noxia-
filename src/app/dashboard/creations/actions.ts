"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeAssetsForGeneration } from "@/lib/storage";
import { fetchCreations, parseTab, UUID_RE, type CreationsPage } from "@/lib/creations";

// Toutes les actions déterminent l'utilisateur À PARTIR DE LA SESSION. Aucun user_id n'est lu dans les arguments du navigateur.
async function sessionUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function loadMoreCreationsAction(tab: string, cursor: string): Promise<CreationsPage> {
  const { supabase, user } = await sessionUser();
  if (!user) return { ok: false };
  return fetchCreations(supabase, parseTab(tab), cursor);
}

export type DeleteResult = { ok: true } | { ok: false; message: string };
const GENERIC: DeleteResult = { ok: false, message: "Suppression impossible pour le moment. Réessaie dans quelques instants." };

export async function deleteCreationAction(source: string, id: string): Promise<DeleteResult> {
  const { supabase, user } = await sessionUser();
  if (!user) return { ok: false, message: "Session expirée. Reconnecte-toi." };
  if (!UUID_RE.test(id) || (source !== "generation" && source !== "conversation")) return { ok: false, message: "Création introuvable." };

  if (source === "conversation") {
    // Droit DELETE du propriétaire (RLS) ; messages supprimés en cascade.
    const { data, error } = await supabase.from("agent_conversations").delete().eq("id", id).eq("user_id", user.id).select("id");
    if (error) { console.error("delete conversation failed", error.code); return GENERIC; }
    if (!data?.length) return { ok: false, message: "Création introuvable." };
    revalidatePath("/dashboard/creations");
    return { ok: true };
  }

  // Génération : propriété vérifiée avec la session (RLS) AVANT toute opération privilégiée.
  const { data: g } = await supabase.from("generations").select("id,status").eq("id", id).eq("user_id", user.id).maybeSingle<{ id: string; status: string }>();
  if (!g) return { ok: false, message: "Création introuvable." };
  if (g.status === "pending" || g.status === "processing") return { ok: false, message: "Cette création est encore en cours : attends la fin avant de la supprimer." };
  try {
    const files = await removeAssetsForGeneration(user.id, id); // fichiers privés d'abord ; à défaut on garde la génération pour réessayer
    if (files.failed > 0) { console.error("delete generation: files not removed", files.failed); return GENERIC; }
    const { error } = await createAdminClient().from("generations").delete().eq("id", id).eq("user_id", user.id); // pas de droit DELETE côté navigateur
    if (error) { console.error("delete generation failed", error.code); return GENERIC; }
  } catch (e) { console.error("delete generation error", e instanceof Error ? e.message : "unknown"); return GENERIC; }
  revalidatePath("/dashboard/creations");
  return { ok: true };
}
