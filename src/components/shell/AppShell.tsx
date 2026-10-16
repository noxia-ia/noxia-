"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LiveCreditBalance } from "@/components/dashboard/LiveCreditBalance";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export type ShellConversation = { id: string; title: string };
type Props = { userId: string; name: string; planLabel: string; credits: number; isAdmin: boolean; conversations: ShellConversation[]; children: ReactNode };

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard/series", label: "Mini-séries", icon: "video" },
  { href: "/dashboard/creations", label: "Mes créations", icon: "folder" },
  { href: "/dashboard/credits", label: "Mes crédits", icon: "coin" },
  { href: "/dashboard/rewards", label: "Gagner des crédits", icon: "gift" },
  { href: "/dashboard/parrainage", label: "Parrainage", icon: "user" },
  { href: "/dashboard/overview", label: "Vue d’ensemble", icon: "home" },
  { href: "/dashboard/tools", label: "Outils", icon: "sparkle" },
  { href: "/dashboard/agents", label: "Mes agents", icon: "chat" },
  { href: "/dashboard/settings", label: "Paramètres", icon: "settings" },
];

// Pages au design Glassmorphism sombre (voir .nx-ui2 dans globals.css) : chat / agents, image, vidéo.
const GLASS_ROUTES = ["/dashboard", "/dashboard/agents", "/dashboard/image", "/dashboard/video"];
export function AppShell({ userId, name, planLabel, credits, isAdmin, conversations, children }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeConv = pathname === "/dashboard" ? params.get("c") : null;
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Le panneau se referme dès qu'on change de page ou de discussion.
  useEffect(() => { setOpen(false); }, [pathname, activeConv]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); menuBtn.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="nx-shell lg:flex">
      <a href="#noxia-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-md focus:bg-noxia-night focus:px-4 focus:py-3 focus:text-sm focus:text-white">Aller au contenu</a>
      {open && <button type="button" className="nx-overlay" aria-label="Fermer le menu" onClick={() => setOpen(false)} />}

      <aside ref={panel} id="nx-panel" className={`nx-panel ${open ? "is-open" : ""}`} aria-label="Menu principal">
        <div className="nx-panel-head">
          <Logo compact />
          <button type="button" className="nx-icon-btn nx-only-mobile" onClick={() => { setOpen(false); menuBtn.current?.focus(); }} aria-label="Fermer le menu"><Icon name="close" size={20} /></button>
        </div>
        <Link href="/dashboard" className="nx-new-chat"><Icon name="plus" size={18} /> Nouvelle discussion</Link>

        <nav className="nx-history" aria-label="Historique des discussions">
          <p className="nx-panel-title">Récent</p>
          {conversations.length === 0 && <p className="nx-panel-empty">Tes discussions apparaîtront ici.</p>}
          <ul>
            {conversations.map(c => (
              <li key={c.id}><Link href={`/dashboard?c=${c.id}`} aria-current={activeConv === c.id ? "page" : undefined} className={`nx-conv ${activeConv === c.id ? "is-active" : ""}`}><span>{c.title || "Discussion"}</span></Link></li>
            ))}
          </ul>
        </nav>

        <nav className="nx-nav" aria-label="Navigation">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={`nx-nav-link ${isActive(n.href) ? "is-active" : ""}`}><Icon name={n.icon} size={19} /><span>{n.label}</span></Link>
          ))}
          {isAdmin && <Link href="/admin" className="nx-nav-link"><Icon name="lock" size={19} /><span>Centre Admin</span></Link>}
        </nav>

        <Link href="/dashboard/abonnements" className="nx-premium"><Icon name="crown" size={18} /><span><b>NOXIA Premium</b><small>Plus de crédits et de puissance</small></span></Link>
        <div className="nx-panel-foot">
          <Link href="/dashboard/settings" className="nx-who"><span className="noxia-avatar" aria-hidden>{initial}</span><span className="nx-who-text"><strong>{name}</strong><small>{planLabel}</small></span></Link>
          <SignOutButton />
        </div>
      </aside>

      <div className="nx-main">
        <header className="nx-topbar">
          <button ref={menuBtn} type="button" className="nx-icon-btn nx-only-mobile" onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-expanded={open} aria-controls="nx-panel"><Icon name="menu" size={22} /></button>
          <div className="nx-topbar-logo nx-only-mobile"><Logo compact /></div>
          <div className="nx-topbar-right">
            <Link href="/dashboard/credits" className="nx-credits" aria-label="Mes crédits"><Icon name="coin" size={16} /><LiveCreditBalance userId={userId} initialCredits={credits} /></Link>
            <ThemeToggle persist />
            <Link href="/dashboard/settings" className="noxia-avatar nx-avatar-link" aria-label="Mon profil">{initial}</Link>
          </div>
        </header>
        <div className="nx-scroll"><div id="noxia-main" className={GLASS_ROUTES.some(r => pathname === r || pathname.startsWith(`${r}/`)) ? "nx-ui2" : undefined}>{children}</div>
          {pathname !== "/dashboard" && <p className="nx-legal">NOXIA AI est réservé aux 15 ans et plus. Contenus sexuels, impliquant des mineurs ou des personnes réelles sans leur accord : interdits.</p>}
        </div>
      </div>
    </div>
  );
}
