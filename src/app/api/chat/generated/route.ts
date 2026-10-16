import { NextResponse } from "next/server";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { UUID_RE } from "@/lib/validation";
import { downloadGenerated } from "@/lib/attachments/generate";

const NO_STORE = { "Cache-Control": "no-store, private" };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

/**
 * Téléchargement sécurisé d'un fichier généré par l'IA (ZIP / PDF).
 * Vérifie session + propriété + expiration. Aucune URL publique permanente.
 */
export async function GET(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  }
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: "Accès refusé." }, { status: 403, headers: NO_STORE });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400, headers: NO_STORE });
  }

  const r = await downloadGenerated(gate.user.id, id);
  if (!r.ok) {
    return NextResponse.json({ error: r.message }, { status: r.status, headers: NO_STORE });
  }

  return new NextResponse(r.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": r.mime,
      "Content-Disposition": `attachment; filename="${r.name.replace(/"/g, "")}"`,
      "Content-Length": String(r.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
