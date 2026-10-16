"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validateLogin, authErrorMessage } from "@/lib/validation";
import { TextField } from "./TextField";

export function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const invalid = validateLogin(email, password);
    if (invalid) return setError(invalid);
    setError(null); setLoading(true);
    const { error: err } = await createClient().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) return setError(authErrorMessage(err.message));
    router.push("/dashboard"); router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <TextField id="email" label="Email" type="email" autoComplete="email" />
      <TextField id="password" label="Mot de passe" type="password" autoComplete="current-password" />
      <p className="text-right text-sm"><Link href="/forgot-password" className="text-noxia-silver underline">Mot de passe oublié ?</Link></p>
      {notice && !error && <p role="status" className="text-sm text-noxia-silver">{notice}</p>}
      {error && <p role="alert" className="text-sm text-noxia-violet">{error}</p>}
      <button disabled={loading} className="w-full rounded-sm bg-noxia-violet px-6 py-3 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">
        {loading ? "Connexion…" : "Se connecter"}
      </button>
      <p className="text-center text-sm text-noxia-ash">Pas encore de compte ? <Link href="/register" className="text-noxia-silver underline">Créer un compte</Link></p>
    </form>
  );
}
