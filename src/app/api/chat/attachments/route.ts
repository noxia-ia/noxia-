import { NextResponse } from "next/server";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { UUID_RE } from "@/lib/validation";
import { attachmentsEnabled, deleteUpload, saveUpload } from "@/lib/attachments/service";

// Envoi / retrait d'une pièce jointe du chat. Session + âge vérifiés côté serveur AVANT tout traitement ; réponse jamais mise en cache.
const NO_STORE = { "Cache-Control": "no-store" };

// Défense contre les requêtes inter-sites : si le navigateur annonce une origine, elle doit être celle du site.
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: "Accès refusé." }, { status: 403, headers: NO_STORE });
  if (!attachmentsEnabled()) {
    return NextResponse.json({ error: "Les pièces jointes ne sont pas encore activées." }, { status: 503, headers: NO_STORE });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Fichier invalide." }, { status: 400, headers: NO_STORE });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400, headers: NO_STORE });
  const r = await saveUpload(gate.user.id, {
    name: file.name,
    size: file.size,
    bytes: async () => new Uint8Array(await file.arrayBuffer()),
  });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ attachment: r.attachment }, { status: 201, headers: NO_STORE });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403, headers: NO_STORE });
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return NextResponse.json({ error: "Accès refusé." }, { status: 403, headers: NO_STORE });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400, headers: NO_STORE });
  const ok = await deleteUpload(gate.user.id, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: NO_STORE });
}
