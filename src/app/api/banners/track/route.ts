import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/validation";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

// Compte un affichage ou un clic sur la bande d'annonces. Réservé aux utilisateurs connectés ; la base refuse les bandes inactives et les doublons.
// Les statistiques ne sont lisibles que par l'administrateur (admin_banner_stats).
export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  let body: { id?: unknown; kind?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE }); }
  if (typeof body.id !== "string" || !UUID_RE.test(body.id) || (body.kind !== "impression" && body.kind !== "click"))
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  try { await createAdminClient().rpc("track_banner_event", { p_banner_id: body.id, p_user_id: user.id, p_kind: body.kind }); }
  catch { /* statistiques indisponibles (migration 0056 absente ?) : l'utilisateur n'est jamais gêné */ }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
