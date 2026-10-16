"use client";
import { useActionState } from "react";
import { verifyAgeAction } from "@/app/verify-age/actions";
import type { AuthFormState } from "@/lib/auth-types";
import { DobFields, AgeConfirm } from "./DobFields";

export function VerifyAgeForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(verifyAgeAction, { status: "idle" });
  return (
    <form action={formAction} className="mt-4 space-y-4">
      <DobFields />
      <AgeConfirm text="Je confirme que ma date de naissance est exacte." />
      {state.status === "error" && <p role="alert" className="text-sm text-noxia-violet">{state.message}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-sm bg-noxia-violet px-6 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">{pending ? "Vérification…" : "Continuer"}</button>
    </form>
  );
}
