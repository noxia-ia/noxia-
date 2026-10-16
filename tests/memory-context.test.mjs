import assert from "node:assert/strict";
import { selectRelevantMemories, formatMemoryContext } from "../src/lib/memory-context.ts";

const memories = [
  { id: "1", content: "L'utilisateur préfère TypeScript et Next.js.", created_at: "2026-10-04T10:00:00Z" },
  { id: "2", content: "L'utilisateur travaille sur NOXIA AI.", created_at: "2026-10-03T10:00:00Z" },
  { id: "3", content: "Son plat préféré est le riz sauce tomate.", created_at: "2026-10-02T10:00:00Z" },
];

const relevant = selectRelevantMemories(memories, "Je continue le code TypeScript de NOXIA");
assert.equal(relevant[0].id, "1");
assert.match(formatMemoryContext(relevant), /TypeScript/);

const unrelated = selectRelevantMemories(memories, "Quelle est la météo demain ?");
assert.equal(unrelated.length, 0);

const capped = selectRelevantMemories(memories, "NOXIA", { maxItems: 1 });
assert.equal(capped.length, 1);
assert.equal(capped[0].id, "2");
console.log("memory-context tests: ok");
