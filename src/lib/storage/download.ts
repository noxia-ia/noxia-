import "server-only";
import { assertSafeSource } from "./ssrf";
import { ALLOWED_MIME_EXT, DOWNLOAD_TIMEOUT_MS, MAX_BYTES, kindOf, matchesMagic } from "./policy";

// Téléchargement CÔTÉ SERVEUR d'un fichier temporaire de fournisseur. Appelé uniquement par persistAsset(), jamais depuis un composant.
// Aucune redirection suivie, taille bornée en flux, type annoncé ET premiers octets vérifiés. Toute anomalie → exception (le résultat reste alors tel quel).
export async function downloadValidated(sourceUrl: string, expectedMime: string, allowedHosts: string[]): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
  const ext = ALLOWED_MIME_EXT[expectedMime];
  const kind = kindOf(expectedMime);
  if (!ext || !kind) throw new Error("storage:mime_not_allowed");
  const url = await assertSafeSource(sourceUrl, allowedHosts);
  const max = MAX_BYTES[kind];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: "manual", signal: ac.signal, cache: "no-store", headers: { Accept: expectedMime } }); // 3xx → res.ok faux → refusé (pas de contournement de l'allowlist)
    if (!res.ok || !res.body) throw new Error("storage:http");
    if ((res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== expectedMime) throw new Error("storage:content_type");
    if (Number(res.headers.get("content-length") ?? 0) > max) throw new Error("storage:too_large");
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) { await reader.cancel(); throw new Error("storage:too_large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
    if (total === 0 || !matchesMagic(expectedMime, bytes)) throw new Error("storage:bad_content");
    return { bytes, mime: expectedMime, ext };
  } finally { clearTimeout(timer); }
}
