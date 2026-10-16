"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { UUID_RE } from "@/lib/validation";
import { parseBannerForm, type BannerFormState } from "@/lib/banners";

// Le rôle admin est relu en base (requireAdmin) ET imposé par les politiques RLS de ad_banners (is_admin()).
function refresh() { revalidatePath("/admin/banners"); revalidatePath("/dashboard", "layout"); }

export async function saveBannerAction(_prev: BannerFormState, fd: FormData): Promise<BannerFormState> {
  const { supabase } = await requireAdmin();
  const parsed = parseBannerForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const id = String(fd.get("id") ?? "");
  if (id) {
    if (!UUID_RE.test(id)) return { status: "error", message: "Bande introuvable." };
    const { data, error } = await supabase.from("ad_banners").update(parsed.data).eq("id", id).select("id").maybeSingle();
    if (error || !data) return { status: "error", message: "Impossible d’enregistrer la bande. Réessaie." };
  } else {
    const { error } = await supabase.from("ad_banners").insert(parsed.data);
    if (error) return { status: "error", message: "Impossible d’enregistrer la bande. Réessaie." };
  }
  refresh();
  return { status: "ok", message: id ? "Bande modifiée." : "Bande créée." };
}

export async function toggleBannerAction(id: string, active: boolean): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!UUID_RE.test(id)) return;
  await supabase.from("ad_banners").update({ active }).eq("id", id);
  refresh();
}

export async function deleteBannerAction(id: string): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!UUID_RE.test(id)) return;
  await supabase.from("ad_banners").delete().eq("id", id);
  refresh();
}
