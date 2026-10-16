"use client";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { mainNav } from "@/lib/config";
import { useToggle } from "@/hooks/useToggle";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
export function Header() {
  const menu = useToggle();
  return (
    <header className="sticky top-0 z-50 border-b border-noxia-silver/10 bg-noxia-night/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-noxia-ash md:flex">
          {mainNav.map(n => <Link key={n.label} href={n.href} className="hover:text-white">{n.label}</Link>)}
          <Link href="/register" className="rounded-sm bg-noxia-violet px-4 py-2 text-white hover:bg-noxia-violet">Commencer</Link>
          <ThemeToggle />
        </nav>
        <div className="flex items-center gap-1 md:hidden"><ThemeToggle /><button onClick={menu.toggle} className="min-h-11 min-w-11 text-noxia-silver" aria-expanded={menu.on} aria-label="Menu">{menu.on ? "✕" : "☰"}</button></div>
      </div>
      {menu.on && (
        <nav className="flex flex-col gap-4 border-t border-noxia-silver/10 px-5 py-5 text-noxia-ash md:hidden">
          {mainNav.map(n => <Link key={n.label} href={n.href} onClick={menu.close}>{n.label}</Link>)}
          <Link href="/register" className="rounded-sm bg-noxia-violet px-4 py-3 text-center text-white">Commencer</Link>
        </nav>
      )}
    </header>
  );
}
