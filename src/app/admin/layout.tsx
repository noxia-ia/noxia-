import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // refus serveur : non connecté → /login, non admin → accueil (/)
  return (
    <div className="min-h-screen"><a href="#noxia-admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-noxia-night focus:px-4 focus:py-3 focus:text-sm focus:text-white focus:ring-2 focus:ring-noxia-violet">Aller au contenu</a>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-noxia-silver/10 bg-noxia-night px-5 py-4">
        <div className="flex items-center gap-2"><Logo /><ThemeToggle persist /></div>
        <nav aria-label="Administration" className="flex max-w-full flex-nowrap gap-x-2 overflow-x-auto pb-1 text-sm text-noxia-ash sm:flex-wrap sm:gap-x-5 sm:gap-y-1 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:shrink-0 [&_a]:items-center [&_a]:whitespace-nowrap"><Link href="/admin" className="hover:text-white">Admin</Link><Link href="/admin/providers" className="hover:text-white">Fournisseurs</Link><Link href="/admin/campaigns" className="hover:text-white">Campagnes</Link><Link href="/admin/banners" className="hover:text-white">Bande pub</Link><Link href="/admin/analytics" className="hover:text-white">Analytics</Link><Link href="/admin/analytics/audience" className="hover:text-white">Audience</Link><Link href="/admin/nsfw" className="hover:text-white">NSFW</Link><Link href="/admin/marketing" className="hover:text-white">Marketing</Link><Link href="/admin/support" className="hover:text-white">Support</Link><Link href="/admin/pricing" className="hover:text-white">Prix</Link><Link href="/dashboard" className="hover:text-white">← Dashboard</Link></nav>
      </header>
      <main id="noxia-admin-main" className="mx-auto w-full max-w-5xl p-4 sm:p-5 md:p-10">{children}</main>
    </div>
  );
}
