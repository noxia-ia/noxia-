import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { SUPPORT_CATEGORY_LABELS, type SupportCategory } from "@/lib/support-ticket";

interface Ticket { id: string; category: SupportCategory; name: string | null; email: string; company: string | null; message: string; status: "new" | "in_progress" | "resolved"; created_at: string }
const STATUS: Record<Ticket["status"], string> = { new: "Nouveau", in_progress: "En cours", resolved: "Traité" };

async function setStatus(fd: FormData) {
  "use server";
  const { supabase } = await requireAdmin(); // refus serveur : non admin → redirigé
  const id = String(fd.get("id") ?? ""), status = String(fd.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["new", "in_progress", "resolved"].includes(status)) return;
  await supabase.from("support_tickets").update({ status, handled_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/admin/support");
}

export default async function AdminSupportPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("support_tickets").select("id,category,name,email,company,message,status,created_at").order("created_at", { ascending: false }).limit(100).returns<Ticket[]>();
  const tickets = data ?? [];
  return (
    <section>
      <h1 className="font-display text-2xl tracking-widest text-noxia-silver">Support & partenariats</h1>
      <p className="mt-2 text-sm text-noxia-ash">{tickets.filter(t => t.status === "new").length} nouveau(x) · {tickets.length} affiché(s)</p>
      {error && <p className="mt-4 text-sm text-red-300">Lecture impossible : la migration 0055 est-elle appliquée ?</p>}
      <ul className="mt-5 space-y-3">
        {tickets.map(t => (
          <li key={t.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-noxia-ash">
              <span className="rounded-full border border-purple-500/30 px-2 py-0.5 text-purple-200">{SUPPORT_CATEGORY_LABELS[t.category]}</span>
              <span>{new Date(t.created_at).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC · {STATUS[t.status]}</span>
            </div>
            <p className="mt-2 text-sm text-noxia-silver">{t.name ?? "Anonyme"} · <a className="underline" href={`mailto:${t.email}`}>{t.email}</a>{t.company ? ` · ${t.company}` : ""}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-noxia-silver">{t.message}</p>
            <form action={setStatus} className="mt-3 flex gap-2"><input type="hidden" name="id" value={t.id} />
              {t.status !== "in_progress" && <button name="status" value="in_progress" className="min-h-11 rounded-xl border border-white/15 px-3 text-sm text-noxia-silver">Prendre en charge</button>}
              {t.status !== "resolved" && <button name="status" value="resolved" className="min-h-11 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3 text-sm text-white">Marquer traité</button>}
            </form>
          </li>
        ))}
        {!tickets.length && !error && <li className="text-sm text-noxia-ash">Aucun message pour le moment.</li>}
      </ul>
    </section>
  );
}
