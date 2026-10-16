import Image from "next/image";
import Link from "next/link";
import { site } from "@/lib/config";

// noxia-logo.png = logo recadré (tête + NOXIA AI + slogan), extrait de la planche de marque. Taille réelle : 1000 × 420, fond transparent.
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className={`noxia-logo ${compact ? "noxia-logo-compact" : ""}`} aria-label={site.name}>
      <Image src="/brand/noxia-logo.png" alt="NOXIA AI — Imaginez. Créez. Innovez." width={1000} height={420} priority className="noxia-logo-image" />
    </Link>
  );
}
