"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveNsfwSettingsAction, type NsfwActionState } from "./actions";
import type { ContentSettings } from "@/lib/admin/nsfw";

const initial: NsfwActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 rounded-sm bg-noxia-violet px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Enregistrement…" : "Enregistrer"}
    </button>
  );
}

export function NsfwSettingsForm({ initial: s }: { initial: ContentSettings }) {
  const [state, action] = useFormState(saveNsfwSettingsAction, initial);

  return (
    <form action={action} className="space-y-4 text-sm">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="nsfw_enabled"
          defaultChecked={s.nsfw_enabled}
          className="mt-1"
        />
        <span>
          <span className="text-noxia-silver">Autoriser les contenus NSFW (modules média)</span>
          <span className="block text-xs text-noxia-ash">
            N&apos;ouvre pas l&apos;accès aux conversations. Sujet à l&apos;âge et au plan.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="nsfw_requires_age_verified"
          defaultChecked={s.nsfw_requires_age_verified}
          className="mt-1"
        />
        <span>
          <span className="text-noxia-silver">Exiger la vérification d&apos;âge</span>
          <span className="block text-xs text-noxia-ash">
            Obligatoire si NSFW est activé (contrainte SQL + applicative).
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="nsfw_requires_paid_plan"
          defaultChecked={s.nsfw_requires_paid_plan}
          className="mt-1"
        />
        <span>
          <span className="text-noxia-silver">Réserver le NSFW aux plans payants</span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="mini_series_nsfw_allowed"
          defaultChecked={s.mini_series_nsfw_allowed}
          className="mt-1"
        />
        <span>
          <span className="text-noxia-silver">Autoriser le NSFW dans les mini-séries</span>
          <span className="block text-xs text-noxia-ash">
            Toujours soumis à l&apos;âge et à la modération serveur.
          </span>
        </span>
      </label>

      <Submit />
      {state.status === "ok" && (
        <p className="text-sm text-emerald-400">{state.message}</p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-red-400">{state.message}</p>
      )}
    </form>
  );
}
