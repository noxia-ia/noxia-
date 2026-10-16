"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PASSWORD_MIN } from "@/lib/validation";
import { TextField } from "./TextField";

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    const confirm = String(f.get("confirm") ?? "");
    if (password.length < PASSWORD_MIN) return setError(`Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`);
    if (password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setError(null); setLoading(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (err) return setError("Impossible de changer le mot de passe. Le lien a peut-être expiré : demande-en un nouveau.");
    router.push("/dashboard"); router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <TextField id="password" label="Nouveau mot de passe" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} />
      <TextField id="confirm" label="Confirme le mot de passe" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} />
      {error && <p role="alert" className="text-sm text-noxia-violet">{error}</p>}
      <button disabled={loading} className="w-full rounded-sm bg-noxia-violet px-6 py-3 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">
        {loading ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </button>
      <p className="text-center text-sm text-noxia-ash"><Link href="/forgot-password" className="text-noxia-silver underline">Demander un nouveau lien</Link></p>
    </form>
  );
}
