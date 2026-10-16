import Link from "next/link";
import type { ReactNode } from "react";
export function Button({ href, children, variant="primary" }: { href: string; children: ReactNode; variant?: "primary"|"ghost" }) {
  const base = "inline-flex items-center justify-center rounded-sm px-6 py-3 text-sm font-medium transition-colors";
  const styles = variant==="primary"
    ? "bg-noxia-violet text-white hover:bg-noxia-violet shadow-glow"
    : "border border-noxia-silver/30 text-noxia-silver hover:border-noxia-violet hover:text-white";
  return <Link href={href} className={`${base} ${styles}`}>{children}</Link>;
}
