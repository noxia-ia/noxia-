import "server-only";
import { createFalClient } from "@fal-ai/client";
import type { VideoJob, VideoProvider, VideoRequest, VideoResult } from "@/lib/ai/video/types";
import { ProviderError, fromHttpStatus } from "@/lib/providers/errors";

// fal.ai / Wan 3.0 Text-to-Video.
// Documentation officielle consultée le 03/10/2026 :
// https://fal.ai/models/alibaba/wan-3.0/text-to-video/api
// Endpoint : alibaba/wan-3.0/text-to-video
// Le fournisseur utilise sa file de jobs : submit -> request_id -> status -> result.
// La clé est injectée par le registre côté serveur et n'est jamais lue par le navigateur.
const DEFAULT_ENDPOINT = "alibaba/wan-3.0/text-to-video";

type FalVideoFile = {
  url?: unknown;
  content_type?: unknown;
  width?: unknown;
  height?: unknown;
  duration?: unknown;
};

type FalVideoData = { video?: FalVideoFile; duration?: unknown };

type FalStatus = { status?: string };

const isAbortLike = (e: unknown) => {
  const name = (e as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
};

function classifyFalError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (isAbortLike(e)) return new ProviderError("PROVIDER_TIMEOUT", "abort");
  const status = Number((e as { status?: unknown } | null)?.status ?? (e as { response?: { status?: unknown } } | null)?.response?.status ?? 0);
  if (status >= 400 && status <= 599) return fromHttpStatus(status);
  if (e instanceof TypeError) return new ProviderError("PROVIDER_UNAVAILABLE", "network");
  return new ProviderError("GENERATION_FAILED", "fal_error");
}

function endpoint(model: string): string {
  const m = model.trim();
  return m || DEFAULT_ENDPOINT;
}

function aspectRatio(format: VideoRequest["format"]): "16:9" | "9:16" | "1:1" {
  if (format === "vertical") return "9:16";
  if (format === "square") return "1:1";
  return "16:9";
}

function resolution(quality: VideoRequest["quality"]): "720p" | "1080p" {
  return quality === "standard" ? "720p" : "1080p";
}

function promptWithControls(req: VideoRequest): string {
  const style = req.style === "3d" ? "3D" : req.style;
  return `${req.prompt}\nVisual style: ${style}. Camera: ${req.camera.replaceAll("_", " ")}. Motion: ${req.motion.replaceAll("_", " ")}.`;
}

function parseResult(data: unknown): VideoResult {
  const d = data as FalVideoData | null;
  const v = d?.video;
  if (!v || typeof v.url !== "string" || !/^https:\/\//.test(v.url)) throw new ProviderError("RESULT_INVALID", "video_url");
  const mime = typeof v.content_type === "string" ? v.content_type.split(";", 1)[0].trim().toLowerCase() : "video/mp4";
  if (mime !== "video/mp4" && mime !== "video/webm") throw new ProviderError("RESULT_INVALID", "video_mime");
  const duration = typeof v.duration === "number" && Number.isFinite(v.duration) && v.duration > 0 ? v.duration
    : typeof d?.duration === "number" && Number.isFinite(d.duration) && d.duration > 0 ? d.duration : undefined;
  const width = typeof v.width === "number" && Number.isFinite(v.width) && v.width > 0 ? v.width : undefined;
  const height = typeof v.height === "number" && Number.isFinite(v.height) && v.height > 0 ? v.height : undefined;
  return { asset: { url: v.url, mimeType: mime, durationSeconds: duration, width, height } };
}

export class FalVideo implements VideoProvider {
  readonly id = "fal";
  private readonly client: ReturnType<typeof createFalClient>;
  private readonly endpointId: string;

  constructor(apiKey: string, model: string) {
    if (!apiKey.trim()) throw new ProviderError("PROVIDER_MISCONFIGURED", "missing_key");
    this.client = createFalClient({ credentials: apiKey });
    this.endpointId = endpoint(model);
  }

  async generate(req: VideoRequest, opts: { signal?: AbortSignal } = {}): Promise<VideoJob> {
    if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "aborted_before_submit");
    try {
      const queued = await this.client.queue.submit(this.endpointId, {
        input: {
          prompt: promptWithControls(req),
          resolution: resolution(req.quality),
          duration: req.durationSeconds,
          aspect_ratio: aspectRatio(req.format),
          audio: true,
          enable_prompt_expansion: true,
          enable_safety_checker: true,
        },
      });
      if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "aborted_after_submit");
      if (!queued?.request_id || typeof queued.request_id !== "string") throw new ProviderError("RESULT_INVALID", "missing_request_id");
      return { status: "processing", jobId: queued.request_id };
    } catch (e) {
      throw classifyFalError(e);
    }
  }

  async getJob(jobId: string, opts: { signal?: AbortSignal } = {}): Promise<VideoJob> {
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(jobId)) throw new ProviderError("RESULT_INVALID", "job_id");
    if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "aborted_before_status");
    try {
      const status = await this.client.queue.status(this.endpointId, { requestId: jobId }) as FalStatus;
      if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "aborted_after_status");
      const state = String(status?.status ?? "").toUpperCase();
      if (state === "IN_QUEUE" || state === "IN_PROGRESS") return { status: "processing", jobId };
      if (state === "FAILED" || state === "CANCELLED") return { status: "failed", error: "provider_failed" };
      if (state !== "COMPLETED") return { status: "processing", jobId };
      const result = await this.client.queue.result(this.endpointId, { requestId: jobId });
      if (opts.signal?.aborted) throw new ProviderError("PROVIDER_TIMEOUT", "aborted_after_result");
      return { status: "completed", result: parseResult(result.data) };
    } catch (e) {
      throw classifyFalError(e);
    }
  }
}
