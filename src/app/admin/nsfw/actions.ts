"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { updateContentSettings } from "@/lib/admin/nsfw";

export type NsfwActionState = { status: "idle" | "ok" | "error"; message?: string };

export async function saveNsfwSettingsAction(
  _prev: NsfwActionState,
  formData: FormData
): Promise<NsfwActionState> {
  const { supabase } = await requireAdmin();

  const nsfw_enabled = formData.get("nsfw_enabled") === "on";
  const nsfw_requires_age_verified = formData.get("nsfw_requires_age_verified") === "on";
  const nsfw_requires_paid_plan = formData.get("nsfw_requires_paid_plan") === "on";
  const mini_series_nsfw_allowed = formData.get("mini_series_nsfw_allowed") === "on";

  const r = await updateContentSettings(supabase, {
    nsfw_enabled,
    nsfw_requires_age_verified,
    nsfw_requires_paid_plan,
    mini_series_nsfw_allowed,
  });

  revalidatePath("/admin/nsfw");
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "ok", message: "Paramètres enregistrés." };
}
