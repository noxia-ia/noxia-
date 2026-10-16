const steps = ["Choisis ce dont tu as besoin","Explique simplement ce que tu veux faire","Laisse NOXIA t’accompagner"];
export function HowItWorks() {
  return (
    <section id="tarifs" className="mx-auto max-w-6xl px-5 py-20">
      <h2 className="font-display text-3xl text-noxia-silver">Comment ça marche</h2>
      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-6">
            <span className="font-display text-3xl text-noxia-violet">{i + 1}</span>
            <p className="mt-3 text-noxia-silver">{s}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
