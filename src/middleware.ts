import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getAgeStatus } from "@/lib/safety/age";

const isApp = (p: string) => p.startsWith("/dashboard") || p.startsWith("/admin");

export async function middleware(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list: { name: string; value: string; options: CookieOptions }[]) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser(); // validé côté serveur Supabase
  const path = request.nextUrl.pathname;
  // Redirection en conservant les cookies de session éventuellement rafraîchis.
  const redirectTo = (target: string) => {
    const r = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach(c => r.cookies.set(c));
    return r;
  };
  const isAuthPage = path === "/login" || path === "/register";
  const isAgePage = path === "/verify-age" || path === "/age-restricted";

  if (!user) return isApp(path) || isAgePage ? redirectTo("/login") : response;

  // Source de vérité : profiles.date_of_birth en base (RLS : son propre profil). Jamais un cookie ni une valeur du navigateur.
  const { data: p } = await supabase.from("profiles").select("date_of_birth").eq("user_id", user.id).maybeSingle<{ date_of_birth: string | null }>();
  const status = getAgeStatus(p?.date_of_birth ?? null);
  const home = status === "ok" ? "/dashboard" : status === "restricted" ? "/age-restricted" : "/verify-age"; // page autorisée pour ce statut

  if (isAuthPage) return redirectTo(home);
  if (isApp(path)) return status === "ok" ? response : redirectTo(home);
  if (isAgePage) return path === home ? response : redirectTo(home); // pas de boucle : la page « home » est toujours servie
  return response;
}
// La landing page et /auth/* ne sont pas concernées par le middleware.
export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register", "/verify-age", "/age-restricted"] };
