"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseSupportTicket } from "@/lib/support-ticket";

export interface SupportState { ok: boolean; message: string }
const MAX_PER_10_MIN = 3;

// Enregistre un ticket dans Supabase (support_tickets). Ouvert aux visiteurs et aux connectés ; l'écriture se fait côté serveur uniquement.
export async function submitSupportTicketAction(_prev: SupportState, fd: FormData): Promise<SupportState> {
  const parsed = parseSupportTicket(fd);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const t = parsed.value;
  try {
    const db = createAdminClient();
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db.from("support_tickets").select("id", { count: "exact", head: true }).eq("email", t.email).gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_10_MIN) return { ok: false, message: "Tu as déjà envoyé plusieurs messages. Patiente quelques minutes." };
    let userId: string | null = null;
    try { const { data } = await (await createClient()).auth.getUser(); userId = data.user?.id ?? null; } catch { /* visiteur non connecté */ }
    const { error } = await db.from("support_tickets").insert({ user_id: userId, category: t.category, name: t.name, email: t.email, company: t.company, message: t.message });
    if (error) return { ok: false, message: "Envoi impossible pour le moment. Écris-nous sur WhatsApp ou par e-mail." };
    return { ok: true, message: "Message envoyé. Notre équipe te répond rapidement." };
  } catch {
    return { ok: false, message: "Envoi impossible pour le moment. Écris-nous sur WhatsApp ou par e-mail." };
  }
}
