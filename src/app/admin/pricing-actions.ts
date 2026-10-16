"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { Plan } from "@/types/database";

const PLANS = new Set<Plan>(["free", "plus", "pro", "ultra", "daily", "weekly", "monthly", "annual"]);
const CURRENCIES = new Set(["XOF", "USD", "EUR"]);

export async function updatePlanPriceAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const plan = String(formData.get("plan") ?? "");
  const currency = String(formData.get("currency") ?? "");
  const amount = Number(formData.get("amount_minor"));
  const active = String(formData.get("active") ?? "false") === "true";
  if (!PLANS.has(plan as Plan) || !CURRENCIES.has(currency) || !Number.isSafeInteger(amount) || amount < 0 || amount > 100_000_000) {
    throw new Error("Prix invalide.");
  }
  const { error } = await supabase.rpc("admin_set_plan_price", {
    p_plan: plan,
    p_currency: currency,
    p_amount_minor: amount,
    p_active: active,
  });
  if (error) throw new Error(error.message.includes("reference_price") ? "Le prix FCFA de référence doit rester actif avant d'activer cette devise." : error.message);
  revalidatePath("/admin/pricing");
  revalidatePath("/pricing");
  revalidatePath("/dashboard/abonnements");
}
