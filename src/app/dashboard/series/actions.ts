"use server";
import { generationGateway } from "@/lib/generation-gateway";
import { revalidatePath } from "next/cache";
import { requireAgeVerifiedUser } from "@/lib/safety/guard";
import { AGE_DENIED_MESSAGE } from "@/lib/safety/age";
import { preflight, settleJob, validateJobWith } from "@/lib/providers/pipeline";
import { executeProvider } from "@/lib/providers/execute";
import { AGENT_MESSAGE_CREDIT_COST } from "@/lib/generation-costs";
import { assetHostsOf } from "@/lib/providers/registry";
import { persistAsset } from "@/lib/storage";
import { failGeneration } from "@/lib/generations";
import { parseVideoResult } from "@/lib/ai/video/validate";
import type { VideoResult, VideoRequest } from "@/lib/ai/video/types";
import { videoCost } from "@/modules/video/config";
import { getVideoProvider } from "@/lib/ai/video";
import { UUID_RE } from "@/lib/validation";
import type { AgentConfig, AgentResponse } from "@/lib/ai/agents/types";
import { nextSeasonBatch } from "@/lib/series-orchestrator";

const SEASON_PLAN_COST = AGENT_MESSAGE_CREDIT_COST; // planification de texte : même coût qu'un message Agent (0 crédit, soumis aux quotas)

const parseSeasonPlan = (value: string, expectedEpisodes: number) => {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const episodes = (parsed as { episodes?: unknown }).episodes;
  if (!Array.isArray(episodes) || episodes.length < 1 || episodes.length > expectedEpisodes) return null;
  const clean = episodes.map((e) => {
    if (!e || typeof e !== "object") return null;
    const x = e as Record<string, unknown>;
    const title = typeof x.title === "string" ? x.title.trim().slice(0, 160) : "";
    const synopsis = typeof x.synopsis === "string" ? x.synopsis.trim().slice(0, 4000) : "";
    const continuity = typeof x.continuity_notes === "string" ? x.continuity_notes.trim().slice(0, 6000) : "";
    return title && synopsis ? { title, synopsis, continuity } : null;
  });
  return clean.every(Boolean) ? clean as Array<{ title: string; synopsis: string; continuity: string }> : null;
};

const err = (message: string) => ({ ok: false as const, message });

export async function createSeriesAction(formData: FormData) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return;
  const { supabase, user } = gate;
  const title = String(formData.get("title") ?? "").trim();
  const genre = String(formData.get("genre") ?? "drama").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const bible = String(formData.get("bible") ?? "").trim();
  const seasons = Math.max(1, Math.min(20, Number(formData.get("seasons") ?? 1) || 1));
  const episodes = Math.max(1, Math.min(50, Number(formData.get("episodes") ?? 8) || 8));
  if (title.length < 1 || title.length > 120) return;
  if (synopsis.length > 4000 || bible.length > 12000) return;
  const { data, error } = await supabase.from("series").insert({ user_id: user.id, title, genre, synopsis, bible, seasons, episodes_per_season: episodes }).select("id").single();
  if (error || !data) return;
  revalidatePath("/dashboard/series");
  return;
}

function continuityPrompt(series: { title: string; genre: string; synopsis: string; bible: string }, characters: Array<{ name: string; description: string; traits: string }>, previous: Array<{ season_number: number; episode_number: number; title: string; synopsis: string; continuity_notes: string }>, episode: { title: string; synopsis: string; continuity_notes: string }) {
  const chars = characters.map(c => `- ${c.name}: ${c.description}. Traits: ${c.traits}`).join("\n").slice(0, 7000);
  const prev = previous.slice(-3).map(e => `S${e.season_number}E${e.episode_number} ${e.title}: ${e.synopsis}. Continuité: ${e.continuity_notes}`).join("\n").slice(0, 7000);
  return `Série NOXIA: ${series.title}\nGenre: ${series.genre}\nSynopsis: ${series.synopsis}\nBible/continuité: ${series.bible}\nPersonnages:\n${chars}\nÉpisodes précédents récents:\n${prev || "Aucun épisode précédent."}\nNouvel épisode: ${episode.title}\nSynopsis épisode: ${episode.synopsis}\nNotes de continuité: ${episode.continuity_notes}\n\nGénère une scène vidéo cohérente avec cette bible. Conserve les personnages, leurs relations, le ton, les lieux et les événements établis. Ne réinitialise pas l'histoire et ne contredis pas les épisodes précédents.`.slice(0, 20000);
}

export async function planSeasonAction(formData: FormData) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return;
  const { supabase, user } = gate;
  const seriesId = String(formData.get("seriesId") ?? "");
  const season = Number(formData.get("season") ?? 1);
  const requestedEpisodes = Number(formData.get("episodes") ?? 0);
  const vision = String(formData.get("vision") ?? "").trim().slice(0, 4000);
  if (!UUID_RE.test(seriesId) || !Number.isInteger(season) || season < 1 || season > 20) return;
  const { data: series } = await supabase.from("series").select("id,title,genre,synopsis,bible,seasons,episodes_per_season").eq("id", seriesId).eq("user_id", user.id).maybeSingle();
  if (!series) return;
  const targetCount = Math.max(1, Math.min(50, Number.isInteger(requestedEpisodes) && requestedEpisodes > 0 ? requestedEpisodes : series.episodes_per_season));
  if (season > series.seasons) return;
  const { data: existing } = await supabase.from("series_episodes").select("episode_number").eq("series_id", seriesId).eq("user_id", user.id).eq("season_number", season);
  const existingNumbers = new Set((existing ?? []).map(e => Number(e.episode_number)));
  const missing = Array.from({ length: targetCount }, (_, i) => i + 1).filter(n => !existingNumbers.has(n));
  if (missing.length === 0) return;

  const [{ data: chars }, { data: previous }, { data: profile }] = await Promise.all([
    supabase.from("series_characters").select("name,description,traits").eq("series_id", seriesId).eq("user_id", user.id).order("created_at").limit(30),
    supabase.from("series_episodes").select("season_number,episode_number,title,synopsis,continuity_notes").eq("series_id", seriesId).eq("user_id", user.id).eq("status", "completed").order("season_number", { ascending: true }).order("episode_number", { ascending: true }).limit(20),
    supabase.from("profiles").select("locale").eq("user_id", user.id).maybeSingle<{ locale: string | null }>(),
  ]);
  const language = profile?.locale === "en" ? "anglais" : "français";
  const characterBlock = (chars ?? []).map(c => `- ${c.name}: ${c.description}. Traits/relations: ${c.traits}`).join("\n").slice(0, 9000);
  const previousBlock = (previous ?? []).slice(-8).map(e => `S${e.season_number}E${e.episode_number} ${e.title}: ${e.synopsis}. Continuité: ${e.continuity_notes}`).join("\n").slice(0, 9000);
  const prompt = `Planifie la saison ${season} d'une série vidéo. Réponds UNIQUEMENT par JSON valide, sans markdown, de la forme {"episodes":[{"title":"...","synopsis":"...","continuity_notes":"..."}]}. Génère exactement ${missing.length} épisode(s), pour les numéros ${missing.join(", ")}. Langue: ${language}. Série: ${series.title}. Genre: ${series.genre}. Synopsis: ${series.synopsis}. Bible: ${series.bible}. Personnages:\n${characterBlock || "Aucun personnage défini."}\nÉpisodes déjà terminés:\n${previousBlock || "Aucun."}\nVision supplémentaire de l'utilisateur: ${vision || "Aucune."}\nChaque épisode doit faire progresser l'histoire, conserver les personnages et préparer le suivant. Ne révèle aucun fournisseur, aucune clé, aucun détail technique.`.slice(0, 28000);
  const pre = await preflight("agents", { supabase, userId: user.id, prompt, context: "planification de mini-série", cost: SEASON_PLAN_COST });
  if (!pre.ok) return;
  const admission = await generationGateway.generation({ userId: user.id, module: "agents", prompt, params: { kind: "series-season-plan", seriesId, season, count: missing.length }, credits: SEASON_PLAN_COST });
  if (!admission.id) return;
  const generationId = admission.id;
  const agent: AgentConfig = { name: "NOXIA Story Planner", description: "Planificateur narratif de séries", objective: "Construire des saisons cohérentes", role: "showrunner", instructions: "Produis uniquement le JSON demandé. Respecte strictement la bible et la continuité.", domain: "écriture sérielle", personality: "creative", personalityCustom: null, creativity: "medium", language: language === "anglais" ? "en" : "fr" };
  const run = await executeProvider("agents", (provider, signal) => provider.sendMessage({ agent, conversation: [], message: prompt }, { signal }), (raw: AgentResponse) => {
    if (raw.status !== "completed" || !raw.reply.trim()) throw new Error("invalid_plan");
    const parsed = parseSeasonPlan(raw.reply, missing.length);
    if (!parsed || parsed.length !== missing.length) throw new Error("invalid_plan");
    return { status: "completed" as const, result: parsed, reply: raw.reply };
  }, { generationId, admissionKind: "agent" });
  if (!run.ok) { await failGeneration(generationId, run.error.code); return; }
  const settled = await settleJob({ id: generationId, providerId: run.providerId, job: { status: "completed", result: run.value.result }, cost: SEASON_PLAN_COST });
  if (settled.state !== "done") return;
  const rows = run.value.result.map((e, index) => ({ series_id: seriesId, user_id: user.id, season_number: season, episode_number: missing[index], title: e.title, synopsis: e.synopsis, continuity_notes: e.continuity, status: "draft" }));
  const { error: insertError } = await supabase.from("series_episodes").insert(rows);
  if (insertError) return;
  revalidatePath("/dashboard/series");
  return;
}

export async function addCharacterAction(formData: FormData) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return;
  const { supabase, user } = gate;
  const seriesId = String(formData.get("seriesId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const traits = String(formData.get("traits") ?? "").trim();
  if (!UUID_RE.test(seriesId) || !name || name.length > 80 || description.length > 3000 || traits.length > 2000) return err("Personnage invalide.");
  const { error } = await supabase.from("series_characters").insert({ series_id: seriesId, user_id: user.id, name, description, traits });
  if (error) return err(error.code === "23505" ? "Ce personnage existe déjà dans cette série." : "Impossible d'ajouter le personnage.");
  revalidatePath("/dashboard/series");
  return { ok: true as const };
}

export async function addEpisodeAction(formData: FormData) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return;
  const { supabase, user } = gate;
  const seriesId = String(formData.get("seriesId") ?? "");
  const season = Number(formData.get("season") ?? 1);
  const episode = Number(formData.get("episode") ?? 1);
  const title = String(formData.get("title") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const continuity = String(formData.get("continuity") ?? "").trim();
  if (!UUID_RE.test(seriesId) || !Number.isInteger(season) || season < 1 || season > 20 || !Number.isInteger(episode) || episode < 1 || episode > 50 || !title || title.length > 160 || synopsis.length > 4000 || continuity.length > 6000) return err("Épisode invalide.");
  const { error } = await supabase.from("series_episodes").insert({ series_id: seriesId, user_id: user.id, season_number: season, episode_number: episode, title, synopsis, continuity_notes: continuity });
  if (error) return err(error.code === "23505" ? "Cet épisode existe déjà." : "Impossible d'ajouter l'épisode.");
  revalidatePath("/dashboard/series");
  return { ok: true as const };
}

export async function generateSeriesEpisodeAction(formData: FormData) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return;
  const { supabase, user } = gate;
  if (!getVideoProvider()) return err("Cette fonction est momentanément indisponible. Réessaie un peu plus tard.");
  const seriesId = String(formData.get("seriesId") ?? "");
  const episodeId = String(formData.get("episodeId") ?? "");
  if (!UUID_RE.test(seriesId) || !UUID_RE.test(episodeId)) return err("Identifiant invalide.");
  const [{ data: series }, { data: episode }] = await Promise.all([
    supabase.from("series").select("id,title,genre,synopsis,bible").eq("id", seriesId).eq("user_id", user.id).maybeSingle(),
    supabase.from("series_episodes").select("id,series_id,season_number,episode_number,title,synopsis,continuity_notes,status").eq("id", episodeId).eq("series_id", seriesId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!series || !episode) return err("Série ou épisode introuvable.");
  if (episode.status === "processing") return err("Cet épisode est déjà en cours de création.");
  const [{ data: chars }, { data: previous }] = await Promise.all([
    supabase.from("series_characters").select("name,description,traits").eq("series_id", seriesId).eq("user_id", user.id).order("created_at"),
    supabase.from("series_episodes").select("season_number,episode_number,title,synopsis,continuity_notes").eq("series_id", seriesId).eq("user_id", user.id).eq("status", "completed").order("season_number", { ascending: true }).order("episode_number", { ascending: true }).limit(10),
  ]);
  const prompt = continuityPrompt(series, chars ?? [], previous ?? [], episode);
  const req: VideoRequest = { prompt, style: "cinematic", durationSeconds: 10, format: "horizontal", quality: "hd", camera: "cinematic", motion: "normal" };
  const cost = videoCost(req);
  const pre = await preflight("video", { supabase, userId: user.id, prompt, params: { ...req, seriesId, episodeId }, cost, context: "mini-series" });
  if (!pre.ok) return err(pre.message);
  const admission = await generationGateway.generation({ userId: user.id, module: "video", prompt, params: { ...req, seriesId, episodeId, seriesEpisode: true }, credits: cost });
  if (!admission.id) return err(admission.error === "INSUFFICIENT_CREDITS" ? "Crédits insuffisants. Choisis un abonnement pour continuer." : admission.error === "GENERATION_IN_FLIGHT" ? "Une génération est déjà en cours." : "Impossible d'enregistrer la génération.");
  const generationId = admission.id;
  await supabase.from("series_episodes").update({ generation_id: generationId, status: "processing" }).eq("id", episodeId).eq("user_id", user.id);
  const run = await executeProvider("video", (p, signal) => p.generate(req, { signal, userId: user.id, generationId }), validateJobWith<VideoResult>(v => parseVideoResult(v)), { generationId });
  if (!run.ok) { await failGeneration(generationId, run.error.code); await supabase.from("series_episodes").update({ status: "failed" }).eq("id", episodeId).eq("user_id", user.id); revalidatePath("/dashboard/series"); return err(`${run.error.message} Aucun crédit n'a été débité.`); }
  const settled = await settleJob<VideoResult>({ id: generationId, providerId: run.providerId, job: run.value, cost, persist: async r => ({ asset: await persistAsset(r.asset, { userId: user.id, generationId, hosts: assetHostsOf("video", run.providerId), required: true }) }) });
  if (settled.state === "failed") { await supabase.from("series_episodes").update({ status: "failed" }).eq("id", episodeId).eq("user_id", user.id); revalidatePath("/dashboard/series"); return err(`${settled.message} Aucun crédit n'a été débité.`); }
  if (settled.state === "processing") { revalidatePath("/dashboard/series"); return { ok: true as const, status: "processing" as const, message: "L'épisode est en cours de création." }; }
  if (settled.state === "already_done") return { ok: true as const, status: "completed" as const, message: "L'épisode est déjà terminé." };
  await supabase.from("series_episodes").update({ status: "completed" }).eq("id", episodeId).eq("user_id", user.id);
  revalidatePath("/dashboard/series");
  return { ok: true as const, status: "completed" as const, message: "Épisode terminé." };
}

export async function generateSeasonBatchAction(formData: FormData) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return;
  const { supabase, user } = gate;
  const seriesId = String(formData.get("seriesId") ?? "");
  const season = Number(formData.get("season") ?? 1);
  if (!UUID_RE.test(seriesId) || !Number.isInteger(season) || season < 1 || season > 20) return err("Saison invalide.");
  const { data: series } = await supabase.from("series").select("id,seasons,episodes_per_season").eq("id", seriesId).eq("user_id", user.id).maybeSingle();
  if (!series || season > series.seasons) return err("Série ou saison introuvable.");
  const { data: episodes } = await supabase.from("series_episodes").select("id,season_number,episode_number,status").eq("series_id", seriesId).eq("user_id", user.id).eq("season_number", season).order("episode_number", { ascending: true });
  const batch = nextSeasonBatch((episodes ?? []) as Array<{ id: string; season_number: number; episode_number: number; status: "draft" | "processing" | "completed" | "failed" }>, 3);
  if (batch.length === 0) {
    const processing = (episodes ?? []).some(e => e.status === "processing");
    if (processing) return { ok: true as const, status: "processing" as const, count: 0, message: "Un épisode est encore en cours de création. Actualise la page lorsqu'il est prêt." };
    return err("Aucun épisode brouillon prêt à être généré dans cette saison.");
  }
  let completed = 0;
  let processing = false;
  for (const episode of batch) {
    const fd = new FormData();
    fd.set("seriesId", seriesId);
    fd.set("episodeId", episode.id);
    const result = await generateSeriesEpisodeAction(fd);
    if (!result || !result.ok) return { ok: false as const, message: result?.message ?? "Impossible de générer cet épisode.", completed };
    if (result.status === "completed") {
      completed += 1;
      continue;
    }
    processing = true;
    break;
  }
  return { ok: true as const, status: processing ? "processing" as const : "completed" as const, count: completed, message: processing ? `${completed} épisode(s) terminé(s). Le prochain est encore en cours de création.` : `${completed} épisode(s) généré(s) dans ce lot.` };
}


export async function refreshSeriesEpisodeAction(formData: FormData) {
  const gate = await requireAgeVerifiedUser();
  if (!gate.ok) return;
  const { supabase, user } = gate;
  const seriesId = String(formData.get("seriesId") ?? "");
  const episodeId = String(formData.get("episodeId") ?? "");
  if (!UUID_RE.test(seriesId) || !UUID_RE.test(episodeId)) return err("Identifiant invalide.");
  const { data: ep } = await supabase.from("series_episodes").select("id,generation_id,status").eq("id", episodeId).eq("series_id", seriesId).eq("user_id", user.id).maybeSingle();
  if (!ep?.generation_id) return err("Aucune génération à actualiser.");
  const { data: g } = await supabase.from("generations").select("id,status,provider,provider_job_id,params").eq("id", ep.generation_id).eq("user_id", user.id).eq("module", "video").maybeSingle();
  if (!g || g.status !== "processing" || !g.provider || !g.provider_job_id) return err("Cet épisode n'est pas en cours de traitement asynchrone.");
  const { claimPoll } = await import("@/lib/generations");
  if (!(await claimPoll(g.id))) return err("Patiente quelques secondes avant d'actualiser.");
  const provider = getVideoProvider();
  const { getProviderChain } = await import("@/lib/providers/registry");
  const { executeProvider } = await import("@/lib/providers/execute");
  const { validateJobWith } = await import("@/lib/providers/pipeline");
  if (!getProviderChain("video", { onlyId: g.provider })[0]?.provider.getJob || !provider) return err("Cette fonction est momentanément indisponible. Réessaie un peu plus tard.");
  const run = await executeProvider("video", (p, signal) => p.getJob!(g.provider_job_id!, { signal }), validateJobWith<VideoResult>(v => parseVideoResult(v)), { onlyId: g.provider, generationId: g.id });
  if (!run.ok) return err(`${run.error.message} Aucun crédit n'a été débité.`);
  const raw = g.params && typeof g.params === "object" ? g.params as Record<string, unknown> : {};
  const duration = Number(raw.durationSeconds);
  if (duration !== 5 && duration !== 10 && duration !== 15) {
    await failGeneration(g.id, "GENERATION_FAILED", g.provider);
    await supabase.from("series_episodes").update({ status: "failed" }).eq("id", episodeId).eq("user_id", user.id);
    revalidatePath("/dashboard/series");
    return err("Paramètres vidéo invalides pour cet épisode.");
  }
  const settled = await settleJob<VideoResult>({ id: g.id, providerId: g.provider, jobId: g.provider_job_id, job: run.value, cost: videoCost({ durationSeconds: duration }), persist: async r => ({ asset: await persistAsset(r.asset, { userId: user.id, generationId: g.id, hosts: assetHostsOf("video", g.provider!), required: true }) }) });
  if (settled.state === "done") await supabase.from("series_episodes").update({ status: "completed" }).eq("id", episodeId).eq("user_id", user.id);
  if (settled.state === "failed") await supabase.from("series_episodes").update({ status: "failed" }).eq("id", episodeId).eq("user_id", user.id);
  revalidatePath("/dashboard/series");
  return { ok: true as const, message: settled.state === "done" ? "Épisode prêt." : settled.state === "processing" ? "Toujours en cours." : settled.state === "already_done" ? "Épisode déjà terminé." : "La génération a échoué." };
}




