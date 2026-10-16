import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Compteur global d'inscriptions pour l'interface publique.
 * Agrégat anonyme uniquement — aucune donnée personnelle.
 * Cache court côté CDN/navigateur pour limiter la charge.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_signup_count");
    if (error) {
      return NextResponse.json({ count: null }, { status: 503, headers: cacheHeaders(60) });
    }
    const count = typeof data === "number" ? data : Number(data) || 0;
    return NextResponse.json(
      { count },
      {
        status: 200,
        headers: {
          ...cacheHeaders(300),
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch {
    return NextResponse.json({ count: null }, { status: 503, headers: cacheHeaders(60) });
  }
}

function cacheHeaders(seconds: number): HeadersInit {
  return {
    "Cache-Control": `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=60`,
  };
}
