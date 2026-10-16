import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { OFFER_PLANS } from "@/lib/plans";
import { loadPriceBook, resolvePrice } from "@/lib/pricing";
import { normalizeCurrency } from "@/lib/locale";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { PlanCard } from "@/components/subscription/PlanCard";

export const metadata: Metadata = { title: "Tarifs — NOXIA AI" };
export const dynamic = "force-dynamic"; // les prix viennent de la base : jamais figés au build

export default async function PricingPage() {
  const supabase = await createClient();
  const book = await loadPriceBook(supabase); // lecture publique des prix ACTIFS (politique RLS anon)
  const { data: { user } } = await supabase.auth.getUser();
  let currency: string | null = null;
  if (user) { const { data } = await supabase.from("profiles").select("display_currency").eq("user_id", user.id).maybeSingle<{ display_currency: string }>(); currency = data?.display_currency ?? null; }
  const cur = normalizeCurrency(currency);
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-16">
        <h1 className="font-display text-4xl text-noxia-silver">Tarifs NOXIA</h1>
        <p className="mt-3 max-w-2xl text-noxia-ash">Les tarifs de référence sont en FCFA. {user ? "" : "Crée un compte pour choisir ta devise d'affichage."}</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {OFFER_PLANS.map(p => {
            const price = resolvePrice(book, p.id, cur);
            return <PlanCard key={p.id} plan={p} price={price} isCurrent={false}
              cta={p.kind === "free" ? { href: user ? "/dashboard" : "/register", label: user ? "Ouvrir NOXIA" : "Commencer gratuitement" } : { href: user ? "/dashboard/abonnements" : "/register", label: user ? "Choisir ce plan" : "Créer un compte" }} />;
          })}
        </div>
        <p className="mt-8 max-w-2xl text-xs text-noxia-ash">Le paiement n'est pas encore automatisé : après avoir choisi un plan, l'activation se fait manuellement par l'équipe NOXIA.</p>
      </main>
      <Footer />
    </>
  );
}
