"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sidebarNav } from "@/lib/config";
import { Logo } from "@/components/ui/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";

const ICONS: Record<string, IconName> = {
  "/dashboard": "home", "/dashboard/image": "image", "/dashboard/video": "video", "/dashboard/series": "video", "/dashboard/agents": "chat", "/dashboard/creations": "folder",
  "/dashboard/credits": "coin", "/dashboard/rewards": "gift", "/dashboard/parrainage": "user", "/dashboard/settings": "settings",
};
const iconFor = (href: string): IconName => ICONS[href] ?? "history"; // « Historique » (lien avec ?tab=) n'a pas d'icône dédiée

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => !href.includes("?") && (pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)));

  return (
    <aside className="noxia-sidebar">
      {/* Mobile : barre horizontale défilante ; à partir de md : colonne verticale. */}
      <nav className="noxia-sidebar-nav overflow-x-auto md:overflow-visible" aria-label="Navigation principale">
        {sidebarNav.map(nav => (
          <Link key={nav.href} href={nav.href} aria-current={isActive(nav.href) ? "page" : undefined} className={`noxia-side-link ${isActive(nav.href) ? "is-active" : ""}`}>
            <Icon name={iconFor(nav.href)} size={21} />
            <span>{nav.label}</span>
          </Link>
        ))}
        {isAdmin && (
          <Link href="/admin" className={`noxia-side-link ${pathname.startsWith("/admin") ? "is-active" : ""}`}>
            <Icon name="lock" size={21} /><span>Centre Admin</span>
          </Link>
        )}
      </nav>
      <div className="noxia-premium-mini">
        <Icon name="star" size={26} className="noxia-premium-star" />
        <strong>NOXIA Premium</strong>
        <p>Plus de crédits, plus de puissance, plus de liberté !</p>
        <Link href="/dashboard/abonnements">Passer à Premium <Icon name="arrow" size={13} /></Link>
      </div>
      <div className="noxia-sidebar-footer"><Logo compact /></div>
    </aside>
  );
}
