export interface MemoryContextItem {
  id: string;
  content: string;
  created_at: string;
}

const STOP_WORDS = new Set([
  "avec", "dans", "pour", "mais", "comme", "plus", "moins", "sans", "être", "avoir", "est", "sont", "une", "des", "les", "son", "sa", "ses", "sur", "qui", "que", "quoi", "comment",
  "this", "that", "with", "from", "about", "your", "you", "the", "and", "for", "are",
]);

function terms(value: string): string[] {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/**
 * Select a small, deterministic subset of explicit memories for a new message.
 * This is relevance ranking, not automatic memory creation: only already-saved
 * user memories are eligible.
 */
export function selectRelevantMemories(
  memories: MemoryContextItem[],
  message: string,
  options: { maxItems?: number; maxChars?: number } = {},
): MemoryContextItem[] {
  const maxItems = Math.min(Math.max(options.maxItems ?? 8, 1), 20);
  const maxChars = Math.min(Math.max(options.maxChars ?? 5000, 500), 8000);
  const query = new Set(terms(message));

  const ranked = memories.map((memory, index) => {
    const memoryTerms = terms(memory.content);
    const overlap = memoryTerms.reduce((score, term) => score + (query.has(term) ? 1 : 0), 0);
    const exactPhrase = message.trim() && memory.content.toLocaleLowerCase("fr-FR").includes(message.trim().toLocaleLowerCase("fr-FR")) ? 3 : 0;
    const recency = overlap > 0 || exactPhrase > 0
      ? Math.max(0, memories.length - index) / Math.max(memories.length, 1) * 0.25
      : 0;
    return { memory, score: overlap + exactPhrase + recency };
  });

  ranked.sort((a, b) => b.score - a.score || b.memory.created_at.localeCompare(a.memory.created_at));

  const selected: MemoryContextItem[] = [];
  let used = 0;
  for (const { memory, score } of ranked) {
    if (selected.length >= maxItems) break;
    // If the query has useful terms, avoid injecting unrelated memories.
    if (query.size > 0 && score < 0.25) continue;
    const cost = memory.content.length + 4;
    if (used + cost > maxChars) continue;
    selected.push(memory);
    used += cost;
  }
  return selected;
}

export function formatMemoryContext(memories: MemoryContextItem[]): string {
  return memories.map((memory) => `- ${memory.content}`).join("\n");
}
