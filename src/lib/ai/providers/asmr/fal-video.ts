import "server-only";
import type { ASMRJob, ASMRProvider, ASMRRequest } from "@/lib/ai/asmr/types";
import type { VideoProvider, VideoRequest } from "@/lib/ai/video/types";
import { FalVideo } from "@/lib/ai/providers/video/fal";
import { ProviderError } from "@/lib/providers/errors";

// Adaptateur interne : réutilise le moteur vidéo déjà présent pour les scènes ASMR vidéo.
// Le navigateur ne connaît ni cet adaptateur ni le fournisseur sous-jacent.
export class FalASMRVideo implements ASMRProvider {
  readonly id = "fal-video";
  private readonly delegate: VideoProvider;
  constructor(apiKey: string, model: string, timeoutMs = 300_000) {
    this.delegate = new FalVideo(apiKey, model);
    void timeoutMs;
  }
  async generate(req: ASMRRequest, opts: { signal?: AbortSignal } = {}): Promise<ASMRJob> {
    if (req.type !== "video") throw new ProviderError("INVALID_REQUEST", "asmr_video_only");
    const videoReq: VideoRequest = {
      prompt: `${req.prompt}\nASMR visual direction: tactile, satisfying, close-up details, realistic foley-friendly motion. Style: ${req.style}. Ambiance: ${req.ambiance}.`,
      style: req.style === "ultra_realistic" ? "realistic" : req.style === "intense" ? "cinematic" : "realistic",
      durationSeconds: req.durationSeconds,
      format: req.format,
      quality: "standard",
      camera: "static",
      motion: req.style === "intense" ? "normal" : "slow",
    };
    const job = await this.delegate.generate(videoReq, opts);
    if (job.status === "processing") return job;
    if (job.status === "failed") return job;
    return { status: "completed", result: { asset: { kind: "video", url: job.result.asset.url, storedUrl: job.result.asset.storedUrl, mimeType: job.result.asset.mimeType, durationSeconds: job.result.asset.durationSeconds, width: job.result.asset.width, height: job.result.asset.height } } };
  }
  async getJob(jobId: string, opts: { signal?: AbortSignal } = {}): Promise<ASMRJob> {
    const job = await this.delegate.getJob?.(jobId, opts);
    if (!job) throw new ProviderError("NO_PROVIDER", "polling_unavailable");
    if (job.status === "processing" || job.status === "failed") return job;
    return { status: "completed", result: { asset: { kind: "video", url: job.result.asset.url, storedUrl: job.result.asset.storedUrl, mimeType: job.result.asset.mimeType, durationSeconds: job.result.asset.durationSeconds, width: job.result.asset.width, height: job.result.asset.height } } };
  }
  async healthCheck(): Promise<{ ok: boolean }> { return this.delegate.healthCheck ? this.delegate.healthCheck() : { ok: true }; }
}
