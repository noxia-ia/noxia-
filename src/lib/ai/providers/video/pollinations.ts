import "server-only";
import type { VideoAsset, VideoJob, VideoProvider, VideoRequest } from "@/lib/ai/video/types";
import { providerFetchBytes } from "@/lib/providers/http";
import { ProviderError } from "@/lib/providers/errors";
import { MAX_BYTES, matchesMagic } from "@/lib/storage/policy";
import { discardStored, getStorageProvider, persistBytes } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { signJobBody } from "@/lib/jobs/sign";

// Fournisseur VIDÉO : Pollinations (https://gen.pollinations.ai). Documenté : GET /video/{prompt}?model=…  avec une clé API (en-tête Bearer), réponse = fichier vidéo (mp4).
// Le paramètre `duration` et `aspectRatio` sont envoyés selon les conventions habituelles de l'API : À CONFIRMER sur gen.pollinations.ai/video/models pour le modèle choisi.
// Le modèle vient de POLLINATIONS_MODEL_VIDEO (jamais deviné). La réponse est SYNCHRONE (pas de job à interroger) : le fichier est validé par ses octets puis rangé
// dans le stockage privé (la clé n'apparaît jamais dans une URL enregistrée). NON testé par un appel réel depuis ce code.
// ATTENTION hébergeur : la génération dure de quelques dizaines de secondes à plusieurs minutes ; l'hébergeur doit autoriser une exécution aussi longue.
const BASE = "https://gen.pollinations.ai/video/";
const MODEL_RE = /^[A-Za-z0-9._:-]{1,60}$/;
const ASPECT: Record<VideoRequest["format"], string> = { vertical: "9:16", square: "1:1", horizontal: "16:9" };

export function buildPollinationsPrompt(req: VideoRequest): string {
  const style = req.style === "3d" ? "3D" : req.style;
  return `${req.prompt}. Visual style: ${style}. Camera: ${req.camera.replaceAll("_", " ")}. Motion: ${req.motion.replaceAll("_", " ")}.`.slice(0, 1500);
}

export class PollinationsVideo implements VideoProvider {
  readonly id = "pollinations";
  constructor(private readonly apiKey: string, private readonly model: string, private readonly timeoutMs = 300_000) {
    void this.timeoutMs;
    if (!apiKey.trim()) throw new ProviderError("PROVIDER_MISCONFIGURED", "missing_key");
  }

  // MODE ASYNCHRONE (par défaut dès que NOXIA_JOB_SECRET est défini) : la génération est confiée à la fonction de fond Netlify (netlify/functions/video-render-background.mts),
  // la ligne provider_jobs sert de suivi, et getJob() la relit. Sans NOXIA_JOB_SECRET : ancien mode synchrone (sujet au délai des fonctions Netlify).
  private asyncReady(): { secret: string; base: string } | null {
    const secret = process.env.NOXIA_JOB_SECRET?.trim();
    const base = (process.env.NOXIA_SITE_URL || process.env.URL || process.env.DEPLOY_URL || "").trim().replace(/\/+$/, "");
    return secret && /^https:\/\//.test(base) ? { secret, base } : null;
  }

  async generate(req: VideoRequest, opts?: { signal?: AbortSignal; userId?: string; generationId?: string }): Promise<VideoJob> {
    if (!opts?.userId || !opts.generationId) throw new ProviderError("PROVIDER_MISCONFIGURED", "pol_no_context");
    if (!MODEL_RE.test(this.model)) throw new ProviderError("PROVIDER_MISCONFIGURED", "pol_model");
    if (!getStorageProvider()) throw new ProviderError("PROVIDER_MISCONFIGURED", "pol_no_storage");
    const async = this.asyncReady();
    if (async) return this.startBackground(req, { userId: opts.userId, generationId: opts.generationId }, async, opts.signal);
    const qs = new URLSearchParams({ model: this.model, duration: String(req.durationSeconds), aspectRatio: ASPECT[req.format] });
    const { bytes, contentType } = await providerFetchBytes(`${BASE}${encodeURIComponent(buildPollinationsPrompt(req))}?${qs}`, {
      method: "GET", signal: opts.signal, accept: "video/mp4, video/webm", headers: { Authorization: `Bearer ${this.apiKey}` },
    }, { maxBytes: MAX_BYTES.video });
    const mime = /webm/i.test(contentType) ? "video/webm" : "video/mp4";
    if (bytes.byteLength === 0 || !matchesMagic(mime, bytes)) throw new ProviderError("RESULT_INVALID", "pol_not_video"); // type réel par les octets
    if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "pol_aborted_before_store");
    let stored: string | null = null;
    try {
      const r = await persistBytes({ userId: opts.userId, generationId: opts.generationId, bytes, mime, ext: mime === "video/webm" ? "webm" : "mp4" });
      stored = r.path;
      return { status: "completed", result: { asset: { url: r.storedUrl, storedUrl: r.storedUrl, mimeType: mime, durationSeconds: req.durationSeconds, format: req.format } } };
    } catch (e) {
      if (stored) await discardStored([stored]);
      throw e instanceof ProviderError ? e : new ProviderError("GENERATION_FAILED", "pol_storage_failed");
    }
  }

  private async startBackground(req: VideoRequest, ctx: { userId: string; generationId: string }, a: { secret: string; base: string }, signal?: AbortSignal): Promise<VideoJob> {
    const db = createAdminClient();
    const ins = await db.from("provider_jobs").upsert({ id: ctx.generationId, user_id: ctx.userId, module: "video", status: "processing", result: null, error_code: null, updated_at: new Date().toISOString() });
    if (ins.error) throw new ProviderError("PROVIDER_UNAVAILABLE", "pol_job_table"); // migration 0055 non appliquée ?
    const body = JSON.stringify({ generationId: ctx.generationId, userId: ctx.userId, prompt: buildPollinationsPrompt(req), model: this.model, durationSeconds: req.durationSeconds, format: req.format });
    const ts = Date.now();
    let res: Response;
    try {
      res = await fetch(`${a.base}/.netlify/functions/video-render-background`, { method: "POST", signal: signal ?? AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json", "x-noxia-timestamp": String(ts), "x-noxia-signature": signJobBody(a.secret, ts, body) }, body });
    } catch { await db.from("provider_jobs").update({ status: "failed", error_code: "PROVIDER_UNAVAILABLE" }).eq("id", ctx.generationId); throw new ProviderError("PROVIDER_UNAVAILABLE", "pol_job_trigger"); }
    if (res.status !== 202 && !res.ok) { await db.from("provider_jobs").update({ status: "failed", error_code: "PROVIDER_UNAVAILABLE" }).eq("id", ctx.generationId); throw new ProviderError("PROVIDER_UNAVAILABLE", "pol_job_trigger_status"); }
    return { status: "processing", jobId: ctx.generationId };
  }

  // Relit l'avancement dans provider_jobs. Une tâche « en cours » depuis plus de 20 minutes est considérée perdue (la fonction de fond est limitée à 15 min).
  async getJob(jobId: string): Promise<VideoJob> {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new ProviderError("RESULT_INVALID", "pol_job_id");
    const { data, error } = await createAdminClient().from("provider_jobs").select("status,result,error_code,created_at").eq("id", jobId).maybeSingle<{ status: string; result: { asset?: VideoAsset } | null; error_code: string | null; created_at: string }>();
    if (error) throw new ProviderError("PROVIDER_UNAVAILABLE", "pol_job_read");
    if (!data) return { status: "failed", error: "GENERATION_FAILED" };
    if (data.status === "completed" && data.result?.asset) return { status: "completed", result: { asset: data.result.asset } };
    if (data.status === "failed") return { status: "failed", error: data.error_code ?? "GENERATION_FAILED" };
    if (Date.now() - Date.parse(data.created_at) > 20 * 60_000) return { status: "failed", error: "PROVIDER_TIMEOUT" };
    return { status: "processing", jobId };
  }
  // Pas de healthCheck() : aucun test gratuit et fiable n'est confirmé ; seule la configuration est vérifiée dans /admin/providers.
}
