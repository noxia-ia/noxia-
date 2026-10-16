"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "./TextField";

export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Entre une adresse e-mail valide.");
    setError(null); setLoading(true);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    // Trop d'envois : on le dit clairement. Pour tout le reste, même message : on ne révèle jamais si une adresse a un compte.
    if (err && /rate|too many|seconds/i.test(err.message)) return setError("Trop de demandes. Réessaie dans quelques minutes.");
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-6 space-y-4">
        <p role="status" className="text-sm text-noxia-silver">Si un compte existe avec cette adresse, un e-mail vient d’être envoyé. Ouvre le lien qu’il contient pour choisir un nouveau mot de passe. Pense à regarder les courriers indésirables.</p>
        <Link href="/login" className="block text-center text-sm text-noxia-silver underline">Retour à la connexion</Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <p className="text-sm text-noxia-ash">Entre l’adresse e-mail de ton compte. Nous t’envoyons un lien pour choisir un nouveau mot de passe.</p>
      <TextField id="email" label="Email" type="email" autoComplete="email" />
      {notice && !error && <p role="status" className="text-sm text-noxia-silver">{notice}</p>}
      {error && <p role="alert" className="text-sm text-noxia-violet">{error}</p>}
      <button disabled={loading} className="w-full rounded-sm bg-noxia-violet px-6 py-3 text-sm font-medium text-white shadow-glow hover:bg-noxia-violet disabled:opacity-60">
        {loading ? "Envoi…" : "Envoyer le lien"}
      </button>
      <p className="text-center text-sm text-noxia-ash"><Link href="/login" className="text-noxia-silver underline">Retour à la connexion</Link></p>
    </form>
  );
}
