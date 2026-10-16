export type SeasonEpisodeStatus = "draft" | "processing" | "completed" | "failed";

export type SeasonEpisode = {
  id: string;
  season_number: number;
  episode_number: number;
  status: SeasonEpisodeStatus;
};

/** Returns the next draft episodes in strict story order, never skipping an earlier episode. */
export function nextSeasonBatch(episodes: SeasonEpisode[], limit = 3): SeasonEpisode[] {
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const ordered = [...episodes].sort((a, b) =>
    a.season_number - b.season_number || a.episode_number - b.episode_number,
  );
  const firstIncomplete = ordered.findIndex((e) => e.status !== "completed");
  if (firstIncomplete < 0) return [];
  const first = ordered[firstIncomplete];
  if (first.status !== "draft") return [];
  const batch: SeasonEpisode[] = [];
  for (let i = firstIncomplete; i < ordered.length && batch.length < safeLimit; i += 1) {
    const episode = ordered[i];
    if (episode.status === "completed") continue;
    if (episode.status !== "draft") break;
    batch.push(episode);
  }
  return batch;
}

export function seasonProgress(episodes: SeasonEpisode[]) {
  const total = episodes.length;
  const completed = episodes.filter((e) => e.status === "completed").length;
  const processing = episodes.filter((e) => e.status === "processing").length;
  const failed = episodes.filter((e) => e.status === "failed").length;
  return { total, completed, processing, failed, remaining: Math.max(0, total - completed) };
}
