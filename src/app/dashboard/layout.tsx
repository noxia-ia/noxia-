import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionProfile, enforceAge } from "@/lib/auth";
import { normalizeLocale } from "@/lib/locale";
import { getCurrentSubscription, effectiveStatus } from "@/lib/subscription";
import { PLANS } from "@/lib/plans";
import { ThemeSync } from "@/components/settings/ThemeSync";
import { getCreditStatus } from "@/lib/credit-status";

// Nouvelle structure : panneau ☰ (nouvelle discussion, historique, créations, crédits, paramètres) + zone principale.
// Mobile d'abord : le panneau est un tiroir (md:/lg: → colonne fixe sur grand écran).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, user, supabase } = await getSessionProfile();
  enforceAge(profile);
  const name = profile?.full_name || (user.user_metadata?.full_name as string | undefined) || user.email || "NOXIA";
  const sub = await getCurrentSubscription(supabase, user.id);
  const credit = await getCreditStatus(supabase, profile?.credits ?? 0); // retire les crédits échus (60 jours) avant l'affichage du solde
  const planId = effectiveStatus(sub) === "active" ? (sub?.plan ?? "free") : "free";
  const planLabel = planId === "free" ? "Gratuit" : PLANS[planId].name.replace(/^NOXIA\s+/, "");
  const [{ data: prefs }, { data: convs }] = await Promise.all([
    supabase.from("user_preferences").select("theme").eq("user_id", user.id).maybeSingle(),
    supabase.from("agent_conversations").select("id,title,last_message").eq("user_id", user.id).eq("status", "active").order("last_message_at", { ascending: false }).limit(30),
  ]);
  const theme = prefs?.theme === "light" || prefs?.theme === "system" ? prefs.theme : "dark";
  const conversations = (convs ?? []).map(c => ({ id: c.id as string, title: ((c.title as string) || (c.last_message as string) || "Discussion").slice(0, 60) }));
  return (
    <div lang={normalizeLocale(profile?.locale)} data-noxia-theme={theme} className="noxia-app-shell md:block">
      <ThemeSync theme={theme} hasPref={!!prefs} />
      <Suspense fallback={null}>
        <AppShell userId={user.id} name={name} planLabel={planLabel} credits={credit.balance} isAdmin={profile?.role === "admin"} conversations={conversations}>{children}</AppShell>
      </Suspense>
    </div>
  );
}
