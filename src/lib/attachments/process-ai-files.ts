import "server-only";
import { extractFileRequests, injectDownloadLinks } from "./ai-file-protocol";
import { generateAndStore } from "./generate";

/**
 * À appeler après la réponse de l'agent, avant de persister le message assistant.
 * Parse les blocs ```noxia-file```, génère ZIP/PDF, stocke dans Supabase, injecte les liens.
 */
export async function processAiGeneratedFiles(
  userId: string,
  assistantReply: string
): Promise<string> {
  const { cleaned, requests } = extractFileRequests(assistantReply);
  if (requests.length === 0) return assistantReply;

  const results: Array<
    | { index: number; ok: true; downloadPath: string; name: string }
    | { index: number; ok: false; message: string }
  > = [];

  // Limite de sécurité : 2 fichiers générés max par réponse
  for (let i = 0; i < Math.min(requests.length, 2); i++) {
    const req = requests[i];
    if (req.kind === "zip") {
      const r = await generateAndStore(userId, "zip", req.name, { entries: req.entries });
      if (r.ok) results.push({ index: i, ok: true, downloadPath: r.downloadPath, name: r.name });
      else results.push({ index: i, ok: false, message: r.message });
    } else {
      const r = await generateAndStore(userId, "pdf", req.name, {
        lines: req.lines,
        title: req.title,
      });
      if (r.ok) results.push({ index: i, ok: true, downloadPath: r.downloadPath, name: r.name });
      else results.push({ index: i, ok: false, message: r.message });
    }
  }

  return injectDownloadLinks(cleaned, results);
}
