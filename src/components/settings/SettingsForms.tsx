"use client";
import { useActionState, useState } from "react";
import { saveProfileAction, saveRegionAction, changePasswordAction, deleteAccountAction, type SettingsState } from "@/app/dashboard/settings/actions";
import type { MessageKey } from "@/lib/i18n/messages";

type Labels = Record<MessageKey, string>;
type Option = { value: string; label: string };
const input = "mt-1 min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver focus:border-noxia-violet disabled:opacity-60";
const button = "min-h-11 rounded-sm bg-noxia-violet px-5 py-2 text-sm font-medium text-white shadow-glow disabled:opacity-60";
const idle: SettingsState = { status: "idle" };

function Feedback({ state, labels }: { state: SettingsState; labels: Labels }) {
  if (state.status === "idle") return null;
  const text = state.status === "ok" ? labels[state.key] : (state.key ? labels[state.key] : state.message);
  return <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-noxia-violet" : "text-noxia-silver"}`}>{text}</p>;
}

export function ProfileForm({ labels, name, email }: { labels: Labels; name: string; email: string }) {
  const [state, action, pending] = useActionState(saveProfileAction, idle);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm text-noxia-ash">{labels["settings.name"]}
        <input name="name" defaultValue={name} required minLength={2} maxLength={80} autoComplete="name" className={input} />
      </label>
      <label className="block text-sm text-noxia-ash">{labels["settings.email"]}
        <input value={email} readOnly disabled className={input} />
        <span className="mt-1 block text-xs">{labels["settings.emailHint"]}</span>
      </label>
      <Feedback state={state} labels={labels} />
      <button disabled={pending} className={button}>{pending ? labels["settings.saving"] : labels["settings.save"]}</button>
    </form>
  );
}

export function RegionForm({ labels, countries, locales, currencies, country, locale, currency }: { labels: Labels; countries: Option[]; locales: Option[]; currencies: Option[]; country: string; locale: string; currency: string }) {
  const [state, action, pending] = useActionState(saveRegionAction, idle);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm text-noxia-ash">{labels["settings.country"]}
        <select name="country" defaultValue={country} className={input}>
          {!country && <option value="">{labels["settings.countryNone"]}</option>}
          {countries.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="mt-1 block text-xs">{labels["settings.countryHint"]}</span>
      </label>
      <label className="block text-sm text-noxia-ash">{labels["settings.language"]}
        <select name="locale" defaultValue={locale} className={input}>{locales.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </label>
      <label className="block text-sm text-noxia-ash">{labels["settings.currency"]}
        <select name="currency" defaultValue={currency} className={input}>{currencies.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <span className="mt-1 block text-xs">{labels["settings.currencyHint"]}</span>
      </label>
      <Feedback state={state} labels={labels} />
      <button disabled={pending} className={button}>{pending ? labels["settings.saving"] : labels["settings.save"]}</button>
    </form>
  );
}

export function PasswordForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState(changePasswordAction, idle);
  const [key, setKey] = useState(0); // vide les champs après succès
  const wrapped = async (fd: FormData) => { await (action as (fd: FormData) => void)(fd); setKey(k => k + 1); };
  return (
    <form key={key} action={wrapped} className="space-y-4">
      <label className="block text-sm text-noxia-ash">{labels["settings.password"]}
        <input type="password" name="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      <label className="block text-sm text-noxia-ash">{labels["settings.passwordConfirm"]}
        <input type="password" name="confirm" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      <Feedback state={state} labels={labels} />
      <button disabled={pending} className={button}>{pending ? labels["settings.saving"] : labels["settings.passwordSave"]}</button>
    </form>
  );
}


export function DeleteAccountForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState(deleteAccountAction, idle);
  if (state.status === "ok") {
    return <p role="status" className="text-sm text-noxia-silver">{labels["settings.accountDeleted"]}</p>;
  }
  return (
    <form action={action} className="mt-4 space-y-4 rounded-sm border border-red-400/20 bg-red-950/10 p-4">
      <p className="text-xs leading-5 text-noxia-ash">{labels["settings.deleteWarning"]}</p>
      <label className="block text-sm text-noxia-ash">{labels["settings.deleteConfirm"]}
        <input name="confirmation" required autoComplete="off" className={input} placeholder="SUPPRIMER MON COMPTE" />
      </label>
      <Feedback state={state} labels={labels} />
      <button type="submit" disabled={pending} className="min-h-11 rounded-sm border border-red-400/40 px-5 py-2 text-sm font-medium text-red-200 disabled:opacity-60">
        {pending ? labels["settings.saving"] : labels["settings.deleteButton"]}
      </button>
    </form>
  );
}
