const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const cls = "w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 py-3 text-base text-noxia-silver focus:border-noxia-violet";

// Saisie seulement : l'âge est calculé et vérifié côté serveur.
export function DobFields() {
  const year = new Date().getFullYear();
  return (
    <fieldset>
      <legend className="mb-1 block text-sm text-noxia-ash">Date de naissance</legend>
      <div className="grid grid-cols-3 gap-2">
        <select name="dobDay" required defaultValue="" aria-label="Jour" className={cls}><option value="" disabled>Jour</option>{Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}</select>
        <select name="dobMonth" required defaultValue="" aria-label="Mois" className={cls}><option value="" disabled>Mois</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select name="dobYear" required defaultValue="" aria-label="Année" className={cls}><option value="" disabled>Année</option>{Array.from({ length: year - 1899 }, (_, i) => year - i).map(y => <option key={y} value={y}>{y}</option>)}</select>
      </div>
    </fieldset>
  );
}
export function AgeConfirm({ text }: { text: string }) {
  return (
    <label className="flex items-start gap-3 text-sm text-noxia-ash">
      <input type="checkbox" name="ageConfirm" required className="mt-1 h-5 w-5 flex-none accent-[#e11d48]" />
      <span>{text}</span>
    </label>
  );
}
