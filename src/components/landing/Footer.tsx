import Link from "next/link";
import { footerLinks, site } from "@/lib/config";
export function Footer() {
  return (
    <footer className="border-t border-noxia-silver/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:justify-between">
        <div>
          <p className="font-display text-xl tracking-[0.2em] text-noxia-silver">{site.name}</p>
          <p className="text-noxia-violet">{site.slogan}</p>
          <p className="mt-3 max-w-xs text-xs text-noxia-ash">NOXIA AI est réservé aux utilisateurs âgés de 15 ans et plus.</p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-noxia-ash md:max-w-md">
          {footerLinks.map(l => <li key={l.label}><Link href={l.href} className="hover:text-white">{l.label}</Link></li>)}
        </ul>
      </div>
    </footer>
  );
}
