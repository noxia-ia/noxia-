import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";
export async function createClient() {
  const store = await cookies();
  const { url, publishableKey } = getSupabaseEnv();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list: { name: string; value: string; options: CookieOptions }[]) {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* appelé depuis un Server Component : le middleware rafraîchit la session */ }
      },
    },
  });
}
