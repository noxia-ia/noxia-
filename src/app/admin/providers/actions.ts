"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { checkProviderHealth, recordHealthCheck } from "@/lib/providers/health";
import { PROVIDER_MODULES, PROVIDER_ID_RE } from "@/lib/providers/config";
import type { ProviderModule } from "@/lib/providers/types";

// Test de santé : aucune génération, aucun crédit, aucun prompt. Réservé aux administrateurs (revérifié côté serveur).
// Seuls le statut et la date sont conservés (migration 0010) ; aucun détail technique n'est remonté à l'écran.
export async function healthCheckAction(formData: FormData) {
  await requireAdmin();
  const module = String(formData.get("module") ?? "");
  const id = String(formData.get("provider") ?? "");
  if (!(PROVIDER_MODULES as string[]).includes(module) || !PROVIDER_ID_RE.test(id)) redirect("/admin/providers");
  const status = await checkProviderHealth(module as ProviderModule, id);
  await recordHealthCheck(module as ProviderModule, id, status);
  redirect("/admin/providers");
}
