import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { site } from "@/lib/config";
export function Hero() {
  return (
    <section id="accueil" className="relative overflow-hidden">
      <div id="noxia" className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:py-32">
        <div>
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-noxia-blue">Une IA proche de l'humain</p>
          <h1 className="font-display text-5xl tracking-[0.08em] text-white sm:text-6xl">{site.name}</h1>
          <p className="mt-4 font-display text-2xl text-noxia-violet">{site.slogan}</p>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-noxia-ash">
            Une intelligence artificielle bienveillante et à l'écoute, conçue pour créer, apprendre, réfléchir et avancer avec toi.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Button href="/register">Commencer gratuitement</Button>
            <Button href="#fonctionnalites" variant="ghost">Découvrir NOXIA</Button>
          </div>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-3xl border border-noxia-violet/25 bg-noxia-night/80 shadow-noxia" aria-label="Concept visuel NOXIA">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_40%,rgba(155,77,255,.28),transparent_48%),radial-gradient(circle_at_35%_70%,rgba(25,191,255,.18),transparent_50%)]" />
          <Image src="/brand/noxia-logo-concept.png" alt="Concept visuel du logo NOXIA AI" fill priority sizes="(max-width: 768px) 90vw, 42vw" className="object-cover opacity-90 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-t from-noxia-night via-transparent to-transparent" />
          <div className="absolute bottom-5 left-5 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-noxia-silver backdrop-blur">Une IA proche de l’humain</div>
        </div>
      </div>
    </section>
  );
}
