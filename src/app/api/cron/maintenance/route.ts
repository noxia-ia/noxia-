import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeStaleAssets } from "@/lib/storage";
import { STALE_PENDING_MINUTES, STALE_PROCESSING_MINUTES } from "@/lib/providers/config";
import { logEvent } from "@/lib/providers/log";

// Tâche de maintenance, appelée par un PLANIFICATEUR de l'hébergeur (voir docs/PROVIDERS.md) : jamais par le navigateur.
// 1) marque « échouées » les générations bloquées (aucun crédit débité, aucun faux résultat) ; 2) supprime les fichiers stockés expirés ou orphelins.
// Protégée par le secret serveur CRON_SECRET (≥ 16 caractères). Sans secret, ou avec un mauvais secret : 404 (on ne révèle pas l'existence de la route).
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(req: NextRequest) {
  if (!authorized(req)) return new NextResponse(null, { status: 404 });
  const { data, error } = await createAdminClient().rpc("expire_stale_generations", { p_pending_minutes: STALE_PENDING_MINUTES, p_processing_minutes: STALE_PROCESSING_MINUTES });
  if (error) return NextResponse.json({ ok: false }, { status: 500 }); // détail jamais renvoyé
  const row = (Array.isArray(data) ? data[0] : data) as { generations_expired?: number; messages_expired?: number } | null;
  const purge = await purgeStaleAssets();
  const expired = Number(row?.generations_expired ?? 0) + Number(row?.messages_expired ?? 0);
  logEvent("maintenance_completed", { expired, purged: purge.removed, purgeFailed: purge.failed });
  return NextResponse.json({ ok: true, expired, purged: purge.removed, purgeFailed: purge.failed });
}
export const GET = run;
export const POST = run;
