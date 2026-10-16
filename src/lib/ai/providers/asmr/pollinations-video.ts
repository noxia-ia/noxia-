import "server-only";
import type { ASMRJob, ASMRProvider, ASMRRequest } from "@/lib/ai/asmr/types";
import type { VideoRequest } from "@/lib/ai/video/types";
import { PollinationsVideo } from "@/lib/ai/providers/video/pollinations";
import { ProviderError } from "@/lib/providers/errors";

// ASMR VIDÉO via Pollinations : réutilise le moteur vidéo Pollinations pour les scènes ASMR (le navigateur ne connaît ni l'adaptateur ni le fournisseur).
export class PollinationsASMRVideo implements ASMRProvider {
  readonly id = "pollinations-video";
  private readonly delegate: PollinationsVideo;
  constructor(apiKey: string, model: string, timeoutMs = 300_000) { this.delegate = new PollinationsVideo(apiKey, model, timeoutMs); }
  async generate(req: ASMRRequest, opts: { signal?: AbortSignal; userId?: string; generationId?: string } = {}): Promise<ASMRJob> {
    if (req.type !== "video") throw new ProviderError("INVALID_REQUEST", "asmr_video_only");
    const videoReq: VideoRequest = {
      prompt: `${req.prompt}\nASMR visual direction: tactile, satisfying, close-up details, realistic foley-friendly motion. Style: ${req.style}. Ambiance: ${req.ambiance}.`,
      style: req.style === "ultra_realistic" ? "realistic" : req.style === "intense" ? "cinematic" : "realistic",
      durationSeconds: req.durationSeconds, format: req.format, quality: "standard", camera: "static", motion: req.style === "intense" ? "normal" : "slow",
    };
    const job = await this.delegate.generate(videoReq, opts);
    if (job.status !== "completed") return job;
    const a = job.result.asset;
    return { status: "completed", result: { asset: { kind: "video", url: a.url, storedUrl: a.storedUrl, mimeType: a.mimeType, durationSeconds: a.durationSeconds, format: a.format } } } as ASMRJob;
  }
}
