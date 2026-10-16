"use client";
import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/app/register/actions";
import { AGE_RESERVED } from "@/lib/safety/age";
import type { AuthFormState } from "@/lib/auth-types";
import { TextField } from "./TextField";
import { DobFields, AgeConfirm } from "./DobFields";
import { ENABLED_LOCALES, CURRENCIES, countryOptions, DEFAULT_LOCALE, DEFAULT_CURRENCY } from "@/lib/locale";

const cls = "mt-1 min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver focus:border-noxia-violet";

export function RegisterForm({ initialRef = "" }: { initialRef?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(registerAction, { status: "idle" });
  if (state.status === "success") return <p role="status" className="mt-6 text-noxia-silver">{state.message} <Link href="/login" className="underline">Se connecter</Link></p>;
  return (
    <form action={formAction} className="mt-6 space-y-4">
      <TextField id="name" label="Nom" autoComplete="name" />
      <TextField id="email" label="Email" type="email" autoComplete="email" />
      <TextField id="password" label="Mot de passe" type="password" autoComplete="new-password" />
      <TextField id="confirm" label="Confirmer le mot de passe" type="password" autoComplete="new-password" />
      <div>
        <TextField id="ref" label="Code de parrainage (facultatif)" required={false} defaultValue={initialRef} autoComplete="off" maxLength={16} placeholder="Ex. A1B2C3D4" />
        <p className="mt-1 text-xs text-noxia-ash">12 crédits offerts à l'inscription, 5 de plus avec un code de parrainage valide.</p>
      </div>
      <label className="block text-sm text-noxia-ash">Pays d'origine
        <select name="country" required defaultValue="" className={cls}><option value="" disabled>— Choisir un pays —</option>{countryOptions(DEFAULT_LOCALE).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-noxia-ash">Langue
          <select name="locale" defaultValue={DEFAULT_LOCALE} className={cls}>{ENABLED_LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
        </label>
        <label className="block text-sm text-noxia-ash">Devise d'affichage
          <select name="currency" defaultValue={DEFAULT_CURRENCY} className={cls}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
        </label>
      </div>
      <DobFields />
      <p className="text-sm text-noxia-ash">{AGE_RESERVED}</p>
      <AgeConfirm text="Je confirme avoir au moins 15 ans et avoir fourni une date de naissance exacte." />
      {state.status === "error" && <p role="alert" className="text-sm text-noxia-violet">{state.message}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">{pending ? "Création…" : "Créer mon compte"}</button>
      <p className="text-center text-sm text-noxia-ash">Déjà inscrit ? <Link href="/login" className="text-noxia-silver underline">Se connecter</Link></p>
    </form>
  );
}
