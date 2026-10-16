import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { site } from "@/lib/config";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-5 py-12">
      <div className="absolute right-3 top-3 z-10"><ThemeToggle /></div>
      <div aria-hidden className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 animate-pulseGlow rounded-full bg-[radial-gradient(circle,#7a0b1c_0%,transparent_70%)]" />
      <div className="relative w-full max-w-md rounded-md border border-noxia-silver/15 bg-noxia-night/90 p-8 shadow-glow">
        <Logo />
        <p className="mt-1 text-sm text-noxia-violet">{site.slogan}</p>
        <h1 className="mt-8 font-display text-2xl text-noxia-silver">{title}</h1>
        {children}
      </div>
    </main>
  );
}
