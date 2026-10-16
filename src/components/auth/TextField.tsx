import type { InputHTMLAttributes } from "react";
export function TextField({ label, id, ...props }: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-noxia-ash">{label}</label>
      <input id={id} name={id} required {...props}
        className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-noxia-silver placeholder:text-noxia-ash/50 focus:border-noxia-violet" />
    </div>
  );
}
