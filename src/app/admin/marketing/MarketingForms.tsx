"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveSourceAction, saveSpendAction, type MarketingActionState } from "./actions";

const idle: MarketingActionState = { status: "idle" };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-noxia-violet px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}

const CHANNELS = [
  "organic",
  "paid_search",
  "paid_social",
  "influencer",
  "affiliate",
  "email",
  "referral",
  "direct",
  "other",
];

export function MarketingForms({ sources }: { sources: string[] }) {
  const [srcState, srcAction] = useFormState(saveSourceAction, idle);
  const [spendState, spendAction] = useFormState(saveSpendAction, idle);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
        <h2 className="font-display text-lg text-noxia-silver">Nouvelle source</h2>
        <form action={srcAction} className="mt-4 space-y-3 text-sm">
          <input
            name="code"
            placeholder="Code (ex. google_ads)"
            required
            className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
          />
          <input
            name="label"
            placeholder="Libellé"
            required
            className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
          />
          <select
            name="channel"
            className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
            defaultValue="paid_social"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Submit label="Ajouter la source" />
          {srcState.status === "ok" && <p className="text-emerald-400">{srcState.message}</p>}
          {srcState.status === "error" && <p className="text-red-400">{srcState.message}</p>}
        </form>
      </section>

      <section className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
        <h2 className="font-display text-lg text-noxia-silver">Enregistrer une dépense</h2>
        <form action={spendAction} className="mt-4 space-y-3 text-sm">
          <input
            name="source_code"
            placeholder="Code source"
            list="source-codes"
            required
            className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
          />
          <datalist id="source-codes">
            {sources.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-noxia-ash">Début</span>
              <input
                type="date"
                name="period_start"
                required
                className="mt-1 w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
              />
            </label>
            <label className="block">
              <span className="text-xs text-noxia-ash">Fin</span>
              <input
                type="date"
                name="period_end"
                required
                className="mt-1 w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs text-noxia-ash">Montant</span>
              <input
                type="number"
                name="amount_euros"
                step="0.01"
                min="0"
                required
                className="mt-1 w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
              />
            </label>
            <label className="block">
              <span className="text-xs text-noxia-ash">Devise</span>
              <select
                name="currency"
                defaultValue="EUR"
                className="mt-1 w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="XOF">XOF</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-noxia-ash">Clics</span>
              <input
                type="number"
                name="clicks"
                min="0"
                defaultValue={0}
                className="mt-1 w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-noxia-ash">Impressions</span>
            <input
              type="number"
              name="impressions"
              min="0"
              defaultValue={0}
              className="mt-1 w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
            />
          </label>
          <input
            name="notes"
            placeholder="Notes (optionnel)"
            maxLength={500}
            className="w-full rounded-sm border border-noxia-silver/20 bg-noxia-black px-3 py-2 text-noxia-silver"
          />
          <Submit label="Enregistrer la dépense" />
          {spendState.status === "ok" && <p className="text-emerald-400">{spendState.message}</p>}
          {spendState.status === "error" && <p className="text-red-400">{spendState.message}</p>}
        </form>
      </section>
    </div>
  );
}
