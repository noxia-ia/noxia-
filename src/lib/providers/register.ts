import { CloudflareImage } from "@/lib/ai/providers/image/cloudflare";
import { CloudflareAgent } from "@/lib/ai/providers/agents/cloudflare";
import { cloudflareAccountId } from "@/lib/ai/providers/cloudflare-client";
import type { ModuleProviders, ProviderEntry } from "./registry";
import type { ProviderModule } from "./types";
import { OpenRouterCode } from "@/lib/ai/providers/code/openrouter";
import { CloudflareCode } from "@/lib/ai/providers/code/cloudflare";
import { OpenRouterAgent } from "@/lib/ai/providers/agents/openrouter";
import { HuggingFaceImage } from "@/lib/ai/providers/image/huggingface";
import { PollinationsImage } from "@/lib/ai/providers/image/pollinations";
import { FalVideo } from "@/lib/ai/providers/video/fal";
import { ElevenLabsASMR } from "@/lib/ai/providers/asmr/elevenlabs";
import { ElevenLabsMusic } from "@/lib/ai/providers/music/elevenlabs";
import { FalASMRVideo } from "@/lib/ai/providers/asmr/fal-video";
import { PollinationsVideo } from "@/lib/ai/providers/video/pollinations";
import { PollinationsASMRVideo } from "@/lib/ai/providers/asmr/pollinations-video";
type Register = <M extends ProviderModule>(module: M, entry: ProviderEntry<ModuleProviders[M]>) => void;

// ✅ SEUL endroit où brancher un fournisseur. VIDE : aucun fournisseur réel n'est connecté (et aucun fournisseur fictif n'existe).
// Pour en ajouter un (détails complets : docs/PROVIDERS.md) :
//   1. écrire son implémentation dans src/lib/ai/providers/<module>/<id>.ts (code | image | video | asmr | agents).
//      Elle implémente l'interface du module (AIProvider, ImageProvider, VideoProvider, ASMRProvider, AgentProvider), commence par `import "server-only"`,
//      lance des ProviderError normalisées et passe par providerFetchJson() (src/lib/providers/http.ts) pour ses appels HTTP ;
//   2. définir sa clé dans une variable SERVEUR (ex. IMAGE_API_KEY) — jamais NEXT_PUBLIC_ ;
//   3. l'enregistrer ci-dessous, par exemple :
//        import { MonFournisseurImage } from "@/lib/ai/providers/image/mon-fournisseur";
//        _register("image", {
//          config: { id: "mon-fournisseur", name: "Mon fournisseur", module: "image", enabled: true, model: "nom-du-modele", supportsAsync: false, supportsPolling: false,
//                    apiKeyEnv: "IMAGE_API_KEY", userSelectable: false, assetHosts: ["cdn.mon-fournisseur.com"] },
//          create: (ctx) => new MonFournisseurImage(ctx.apiKey!, ctx.model, ctx.timeoutMs),
//        });
//   4. choisir son rôle côté serveur : IMAGE_PROVIDER (principal), IMAGE_PROVIDER_SECONDARY, IMAGE_PROVIDER_FALLBACK = id du fournisseur.
export function registerAll(register: Register): void {
  // OpenRouter — API « chat completions » (texte) : donc CODE et AGENTS UNIQUEMENT. Aucune capacité image / vidéo / audio n'est déclarée.
  // Le modèle vient de OPENROUTER_MODEL_CODE / OPENROUTER_MODEL_AGENT : absent → « configuration incomplète » (jamais de modèle par défaut inventé).
  // Utilisé seulement si CODE_PROVIDER / AGENT_PROVIDER (ou _SECONDARY / _FALLBACK) vaut « openrouter ».
  register("code", {
    config: { id: "openrouter", name: "OpenRouter", module: "code", enabled: true, model: "", modelEnv: "OPENROUTER_MODEL_CODE", maxRetries: 1, supportsAsync: false, supportsPolling: false, apiKeyEnv: "OPENROUTER_API_KEY", userSelectable: false },
    create: ctx => new OpenRouterCode(ctx.apiKey!, ctx.model),
  });
  // Cloudflare Workers AI — CODE. Modèle : CLOUDFLARE_MODEL_CODE (« @cf/… »), jamais deviné. Utilisé si CODE_PROVIDER (ou _SECONDARY / _FALLBACK) vaut « cloudflare ».
  register("code", {
    config: { id: "cloudflare", name: "Cloudflare Workers AI", module: "code", enabled: true, model: "", modelEnv: "CLOUDFLARE_MODEL_CODE", maxRetries: 1, supportsAsync: false, supportsPolling: false, apiKeyEnv: "CLOUDFLARE_API_TOKEN", userSelectable: false },
    create: ctx => new CloudflareCode(ctx.apiKey!, cloudflareAccountId(), ctx.model),
  });
  register("agents", {
    config: { id: "openrouter", name: "OpenRouter", module: "agents", enabled: true, model: "", modelEnv: "OPENROUTER_MODEL_AGENT", maxRetries: 1, supportsAsync: false, supportsPolling: false, apiKeyEnv: "OPENROUTER_API_KEY", userSelectable: false },
    create: ctx => new OpenRouterAgent(ctx.apiKey!, ctx.model),
  });
  // Cloudflare Workers AI — AGENTS (texte du chat). Jeton : CLOUDFLARE_API_TOKEN ; compte : CLOUDFLARE_ACCOUNT_ID ; modèle : CLOUDFLARE_MODEL_AGENT (« @cf/… »), jamais deviné.
  // Utilisé seulement si AGENT_PROVIDER (ou _SECONDARY / _FALLBACK) vaut « cloudflare ». OpenRouter reste disponible comme secours.
  register("agents", {
    config: { id: "cloudflare", name: "Cloudflare Workers AI", module: "agents", enabled: true, model: "", modelEnv: "CLOUDFLARE_MODEL_AGENT", maxRetries: 1, supportsAsync: false, supportsPolling: false, apiKeyEnv: "CLOUDFLARE_API_TOKEN", userSelectable: false },
    create: ctx => new CloudflareAgent(ctx.apiKey!, cloudflareAccountId(), ctx.model),
  });
  // Cloudflare Workers AI — IMAGE (FLUX.1 schnell). L'API répond en base64 : `requiresStorage` → indisponible tant que STORAGE_PROVIDER n'est pas configuré.
  // Utilisé seulement si IMAGE_PROVIDER (ou _SECONDARY / _FALLBACK) vaut « cloudflare ». Le ratio, la qualité et le format demandés ne sont pas transmis à ce modèle.
  register("image", {
    config: { id: "cloudflare", name: "Cloudflare Workers AI", module: "image", enabled: true, model: "@cf/black-forest-labs/flux-1-schnell", maxRetries: 1, supportsAsync: false, supportsPolling: false, apiKeyEnv: "CLOUDFLARE_API_TOKEN", userSelectable: false, requiresStorage: true },
    create: ctx => new CloudflareImage(ctx.apiKey!, cloudflareAccountId(), ctx.model),
  });
  // Pollinations — IMAGE (FLUX par défaut ; modèle surchargeable par POLLINATIONS_MODEL_IMAGE, modèle « anime » par POLLINATIONS_MODEL_IMAGE_ANIME). Même clé que la vidéo : POLLINATIONS_API_KEY.
  // Réponse en octets : `requiresStorage`. Utilisé seulement si IMAGE_PROVIDER (ou _SECONDARY / _FALLBACK) vaut « pollinations ». Délai de 24 s : en dessous de la limite des fonctions Netlify.
  register("image", {
    config: { id: "pollinations", name: "Pollinations (image)", module: "image", enabled: true, model: "flux", maxRetries: 0, timeoutMs: 24_000, supportsAsync: false, supportsPolling: false, apiKeyEnv: "POLLINATIONS_API_KEY", userSelectable: false, requiresStorage: true },
    create: ctx => new PollinationsImage(ctx.apiKey!, ctx.model, ctx.timeoutMs),
  });
  // Hugging Face — IMAGE uniquement (tâche text-to-image, fournisseur « hf-inference »). L'API répond par des OCTETS : `requiresStorage` → indisponible tant que
  // STORAGE_PROVIDER n'est pas configuré (jamais de data: URL). Le modèle vient de HF_MODEL_IMAGE (« organisation/modèle ») : absent → « configuration incomplète ».
  // Aucun `assetHosts` : rien n'est téléchargé, les octets sont rangés directement par le fournisseur. Utilisé seulement si IMAGE_PROVIDER (ou _SECONDARY / _FALLBACK) vaut « huggingface ».
  register("image", {
    config: { id: "huggingface", name: "Hugging Face", module: "image", enabled: true, model: "", modelEnv: "HF_MODEL_IMAGE", maxRetries: 1, supportsAsync: false, supportsPolling: false, apiKeyEnv: "HF_API_KEY", userSelectable: false, requiresStorage: true },
    create: ctx => new HuggingFaceImage(ctx.apiKey!, ctx.model),
  });
  // ElevenLabs — MUSIQUE (Eleven Music, POST /v1/music). Même clé que l'ASMR audio : ELEVENLABS_API_KEY. Réponse en octets MP3 : stockage obligatoire.
  // Utilisé seulement si MUSIC_PROVIDER (ou _SECONDARY / _FALLBACK) vaut « elevenlabs ».
  register("music", {
    config: { id: "elevenlabs", name: "ElevenLabs Music", module: "music", enabled: true, model: "music_v1", maxRetries: 0, timeoutMs: 300_000, supportsAsync: false, supportsPolling: false, apiKeyEnv: "ELEVENLABS_API_KEY", userSelectable: false, requiresStorage: true },
    create: ctx => new ElevenLabsMusic(ctx.apiKey!, ctx.model, ctx.timeoutMs),
  });
  // ElevenLabs — Text-to-Sound Effects. Audio ASMR uniquement à cette étape.
  // L'API renvoie directement des octets MP3 : requiresStorage force un stockage serveur avant disponibilité.
  register("asmr", {
    config: { id: "elevenlabs", name: "ElevenLabs", module: "asmr", enabled: true, model: "eleven_text_to_sound_v2", maxRetries: 1, timeoutMs: 180_000, supportsAsync: false, supportsPolling: false, apiKeyEnv: "ELEVENLABS_API_KEY", userSelectable: false, requiresStorage: true },
    create: ctx => new ElevenLabsASMR(ctx.apiKey!, ctx.model, ctx.timeoutMs),
  });
  register("asmr", {
    config: { id: "fal-video", name: "Video engine", module: "asmr", enabled: true, model: "alibaba/wan-3.0/text-to-video", maxRetries: 1, timeoutMs: 300_000, supportsAsync: true, supportsPolling: true, apiKeyEnv: "FAL_API_KEY", userSelectable: false, assetHosts: ["fal.media"] },
    create: ctx => new FalASMRVideo(ctx.apiKey!, ctx.model, ctx.timeoutMs),
  });
  // Pollinations — VIDÉO et ASMR VIDÉO. Clé : POLLINATIONS_API_KEY ; modèle : POLLINATIONS_MODEL_VIDEO (jamais deviné). Réponse synchrone en octets : stockage obligatoire.
  // Utilisé seulement si VIDEO_PROVIDER / ASMR_PROVIDER (ou _SECONDARY / _FALLBACK) vaut « pollinations » / « pollinations-video ». fal.ai reste disponible comme secours.
  register("video", {
    config: { id: "pollinations", name: "Pollinations", module: "video", enabled: true, model: "", modelEnv: "POLLINATIONS_MODEL_VIDEO", maxRetries: 0, timeoutMs: 300_000, supportsAsync: true, supportsPolling: true, apiKeyEnv: "POLLINATIONS_API_KEY", userSelectable: false, requiresStorage: true },
    create: ctx => new PollinationsVideo(ctx.apiKey!, ctx.model, ctx.timeoutMs),
  });
  register("asmr", {
    config: { id: "pollinations-video", name: "Pollinations (ASMR vidéo)", module: "asmr", enabled: true, model: "", modelEnv: "POLLINATIONS_MODEL_VIDEO", maxRetries: 0, timeoutMs: 300_000, supportsAsync: false, supportsPolling: false, apiKeyEnv: "POLLINATIONS_API_KEY", userSelectable: false, requiresStorage: true },
    create: ctx => new PollinationsASMRVideo(ctx.apiKey!, ctx.model, ctx.timeoutMs),
  });
  // fal.ai — Wan 3.0 Text-to-Video. Documentation officielle : https://fal.ai/models/alibaba/wan-3.0/text-to-video/api
  // Le modèle est fixé à l'endpoint documenté ; seule FAL_API_KEY doit être fournie côté serveur.
  // La sortie est une URL HTTPS fal.media, puis persistAsset() la télécharge et la place dans le bucket vidéo privé.
  register("video", {
    config: { id: "fal", name: "fal.ai", module: "video", enabled: true, model: "alibaba/wan-3.0/text-to-video", maxRetries: 1, timeoutMs: 60_000, supportsAsync: true, supportsPolling: true, apiKeyEnv: "FAL_API_KEY", userSelectable: false, assetHosts: ["fal.media"] },
    create: ctx => new FalVideo(ctx.apiKey!, ctx.model),
  });
}
