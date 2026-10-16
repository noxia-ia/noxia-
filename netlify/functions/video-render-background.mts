// Fonction de FOND Netlify (le suffixe « -background » est obligatoire) : répond 202 immédiatement et peut tourner jusqu'à 15 minutes.
// Elle fait le travail long que les fonctions normales ne peuvent pas faire : appeler Pollinations (vidéo), valider le fichier, le ranger dans Supabase Storage,
// puis écrire le résultat dans la table provider_jobs. Le site interroge ensuite cette table (getJob) pour savoir quand la vidéo est prête.
// Variables requises (Netlify) : NOXIA_JOB_SECRET, POLLINATIONS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODEL = /^[A-Za-z0-9._:-]{1,60}$/;
const ASPECT: Record<string, string> = { vertical: "9:16", square: "1:1", horizontal: "16:9" };
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const BUCKET = "dracula-videos";
const MAX_AGE_MS = 5 * 60_000;

const at = (b: Uint8Array, i: number, s: string) => s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
const isMp4 = (b: Uint8Array) => at(b, 4, "ftyp");
const isWebm = (b: Uint8Array) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;

function validSignature(secret: string, ts: number, body: string, sig: string): boolean {
  if (!secret || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex"), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export default async (req: Request) => {
  const secret = process.env.NOXIA_JOB_SECRET ?? "";
  const body = await req.text();
  if (!validSignature(secret, Number(req.headers.get("x-noxia-timestamp")), body, req.headers.get("x-noxia-signature") ?? "")) return new Response("forbidden", { status: 403 });

  let job: { generationId: string; userId: string; prompt: string; model: string; durationSeconds: number; format: string };
  try { job = JSON.parse(body); } catch { return new Response("bad request", { status: 400 }); }
  if (!UUID.test(job.generationId) || !UUID.test(job.userId) || !MODEL.test(job.model) || !ASPECT[job.format] || ![5, 10, 15, 30].includes(job.durationSeconds)
    || typeof job.prompt !== "string" || job.prompt.length < 1 || job.prompt.length > 1500) return new Response("bad request", { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, apiKey = process.env.POLLINATIONS_API_KEY;
  if (!url || !key) return new Response("misconfigured", { status: 500 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const finish = (patch: Record<string, unknown>) => db.from("provider_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", job.generationId).eq("status", "processing");

  if (!apiKey) { await finish({ status: "failed", error_code: "PROVIDER_MISCONFIGURED" }); return new Response("accepted", { status: 202 }); }
  let path: string | null = null;
  try {
    const qs = new URLSearchParams({ model: job.model, duration: String(job.durationSeconds), aspectRatio: ASPECT[job.format] });
    const res = await fetch(`https://gen.pollinations.ai/video/${encodeURIComponent(job.prompt)}?${qs}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "video/mp4, video/webm" }, signal: AbortSignal.timeout(13 * 60_000) });
    if (!res.ok) { await finish({ status: "failed", error_code: res.status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_UNAVAILABLE" }); return new Response("accepted", { status: 202 }); }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mime = isMp4(bytes) ? "video/mp4" : isWebm(bytes) ? "video/webm" : null; // type réel par les octets, jamais le type annoncé
    if (!mime || bytes.byteLength === 0 || bytes.byteLength > MAX_VIDEO_BYTES) { await finish({ status: "failed", error_code: "RESULT_INVALID" }); return new Response("accepted", { status: 202 }); }

    const ext = mime === "video/webm" ? "webm" : "mp4";
    path = `${job.userId}/${job.generationId}/${randomUUID()}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "31536000" });
    if (up.error) throw new Error("storage:upload");
    const rec = await db.from("stored_assets").insert({ user_id: job.userId, generation_id: job.generationId, storage_provider: "supabase-storage", path, mime_type: mime, bytes: bytes.byteLength, expires_at: null });
    if (rec.error) throw new Error("storage:record");
    const storedUrl = `/api/media/video?path=${encodeURIComponent(path)}`;
    await finish({ status: "completed", result: { asset: { url: storedUrl, storedUrl, mimeType: mime, durationSeconds: job.durationSeconds, format: job.format } } });
  } catch (e) {
    if (path) await db.storage.from(BUCKET).remove([path]).catch(() => undefined); // fichier non suivi : retiré
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    await finish({ status: "failed", error_code: timeout ? "PROVIDER_TIMEOUT" : "GENERATION_FAILED" });
  }
  return new Response("accepted", { status: 202 });
};
