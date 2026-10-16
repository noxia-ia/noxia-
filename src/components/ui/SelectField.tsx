export function SelectField({ label, name, value, onChange, options }: { label: string; name: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block text-sm text-noxia-ash">{label}
      <select name={name} value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver focus:border-noxia-violet">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
