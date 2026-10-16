import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Seules ces destinations internes sont acceptées après la connexion par lien (jamais d'adresse externe : pas de redirection ouverte).
const ALLOWED_NEXT = new Set(["/reset-password"]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const target = next && ALLOWED_NEXT.has(next) ? next : "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${target}`);
  }
  // Lien invalide ou expiré : pour une récupération de compte, on propose d'en demander un nouveau.
  if (target === "/reset-password") return NextResponse.redirect(`${origin}/forgot-password?info=expired`);
  return NextResponse.redirect(`${origin}/login?info=confirm`);
}
