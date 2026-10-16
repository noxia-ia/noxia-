import { modules } from "@/modules/registry";
import { ModuleCard } from "@/components/ui/ModuleCard";
export function Modules() {
  return (
    <section id="fonctionnalites" className="mx-auto max-w-6xl px-5 py-20">
      <h2 className="font-display text-3xl text-noxia-silver">Les capacités de NOXIA</h2>
      <p className="mt-2 text-noxia-ash">Crée, réfléchis, code et explore depuis un seul espace.</p>
      <div id="agents" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(m => <ModuleCard key={m.id} m={m} linked={false} />)}
      </div>
    </section>
  );
}
