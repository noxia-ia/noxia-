import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { getCurrentSubscription } from "@/lib/subscription";
import { canDownloadWithoutFilingram } from "@/lib/download-policy";
import { CREATION_TABS, fetchCreations, parseTab } from "@/lib/creations";
import { CreationsBrowser } from "@/components/creations/CreationsBrowser";

export const metadata = { title: "Mes créations — NOXIA AI" };

export default async function CreationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, user } = await getSessionProfile(); // redirige si non connecté ; l'utilisateur vient de la session
  const tab = parseTab((await searchParams).tab);
  const [first, sub] = await Promise.all([fetchCreations(supabase, tab, null), getCurrentSubscription(supabase, user.id)]);
  const canUnwatermarkedVideo = canDownloadWithoutFilingram(sub); // première page seulement (24) ; la suite se charge à la demande
  return (
    <main className="mx-auto w-full max-w-6xl p-5 md:p-10">
      <h1 className="font-display text-3xl text-noxia-silver">Mes créations</h1>
      <p className="mt-2 max-w-xl text-noxia-ash">Retrouve ici tout ce que tu as créé avec NOXIA.</p>
      <nav aria-label="Types de créations" className="-mx-5 mt-6 overflow-x-auto px-5 md:mx-0 md:px-0">
        <ul className="flex w-max gap-2 pb-2">
          {CREATION_TABS.map(t => (
            <li key={t.id}><Link href={t.id === "all" ? "/dashboard/creations" : `/dashboard/creations?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined}
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm ${t.id === tab ? "border-noxia-violet bg-noxia-violet/20 text-white" : "border-noxia-silver/20 text-noxia-ash hover:text-white"}`}>{t.label}</Link></li>
          ))}
        </ul>
      </nav>
      <CreationsBrowser key={tab} tab={tab} initialItems={first.ok ? first.items : []} initialCursor={first.ok ? first.nextCursor : null} initialError={!first.ok} canUnwatermarkedVideo={canUnwatermarkedVideo} />
    </main>
  );
}
