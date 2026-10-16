// Analyse SÉCURISÉE d'une archive ZIP jointe au chat. Module pur (aucun accès réseau, disque ni base) : il reçoit des octets et renvoie un résumé texte.
// Garanties : rien n'est jamais exécuté, rien n'est écrit sur le disque (tout reste en mémoire, bornée) ; tout chemin suspect (ZIP Slip) refuse l'archive entière ;
// bombes de décompression refusées (taille totale, taux de compression, taille déclarée ≠ réelle) ; archives imbriquées et exécutables jamais lus ;
// secrets (.env, clés privées, jetons) exclus ou masqués avant tout envoi au modèle. Le contenu des fichiers est traité comme une DONNÉE non fiable.
import { inflateRawSync } from "node:zlib";

export interface ZipLimits { maxArchiveBytes: number; maxEntries: number; maxDepth: number; maxTotalBytes: number; maxFileBytes: number; maxRatio: number; digestChars: number; perFileChars: number }
export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxArchiveBytes: 4 * 1024 * 1024, maxEntries: 1500, maxDepth: 12, maxTotalBytes: 40 * 1024 * 1024, maxFileBytes: 256 * 1024, maxRatio: 100, digestChars: 60_000, perFileChars: 6_000 };

export type ZipRejectCode = "NOT_ZIP" | "TOO_LARGE" | "TOO_MANY_ENTRIES" | "ENCRYPTED" | "ZIP64" | "PATH_TRAVERSAL" | "BOMB" | "CORRUPT" | "EMPTY";
export type ZipAnalysis =
  | { ok: true; digest: string; stats: ZipStats }
  | { ok: false; code: ZipRejectCode; message: string };
export interface ZipStats { entries: number; filesRead: number; ignored: number; sensitiveExcluded: number; executablesSkipped: number; nestedArchivesSkipped: number; binarySkipped: number; tooBigSkipped: number; symlinksSkipped: number; secretsMasked: number; truncated: boolean }

const MESSAGES: Record<ZipRejectCode, string> = {
  NOT_ZIP: "Ce fichier n'est pas une archive ZIP valide.",
  TOO_LARGE: "L'archive est trop volumineuse.",
  TOO_MANY_ENTRIES: "L'archive contient trop de fichiers.",
  ENCRYPTED: "Les archives chiffrées ne sont pas prises en charge.",
  ZIP64: "Les archives ZIP64 ne sont pas prises en charge.",
  PATH_TRAVERSAL: "L'archive contient des chemins dangereux et a été refusée.",
  BOMB: "L'archive se décompresse en une taille disproportionnée et a été refusée.",
  CORRUPT: "L'archive est corrompue ou incohérente.",
  EMPTY: "L'archive est vide.",
};
const reject = (code: ZipRejectCode): ZipAnalysis => ({ ok: false, code, message: MESSAGES[code] });

const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo", ".cache", ".vercel", ".netlify", "__pycache__", ".venv", "venv", ".idea", ".gradle", "target", "vendor", ".svn", ".hg"]);
const SENSITIVE_NAME = /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|\.pypirc|\.git-credentials|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|[^/]*\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk)|[^/]*(credentials?|secrets?|service[-_]?account)[^/]*\.(json|ya?ml|txt|ini)|\.aws\/[^/]*|\.ssh\/[^/]*)$/i;
const EXECUTABLE_EXT = /\.(exe|dll|so|dylib|msi|bat|cmd|scr|com|apk|app|bin|jar|class|o|a|lib|pyc|wasm|dmg|iso|vbs|lnk)$/i;
const NESTED_ARCHIVE_EXT = /\.(zip|jar|war|gz|tgz|tar|bz2|xz|7z|rar|zst)$/i;
const BINARY_ASSET_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif|heic|mp3|wav|ogg|m4a|flac|mp4|webm|mov|avi|mkv|woff2?|ttf|otf|eot|pdf|psd|ai|sketch|fig|xlsx?|docx?|pptx?|db|sqlite|sqlite3)$/i;
const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|json|jsonc|md|mdx|txt|css|scss|sass|less|html?|vue|svelte|astro|py|rb|php|go|rs|java|kt|swift|c|h|cpp|hpp|cs|sql|ya?ml|toml|ini|cfg|conf|sh|bash|zsh|ps1|xml|csv|tsv|env\.example|gitignore|dockerfile|prisma|graphql|gql|lua|dart|r|ex|exs)$/i;
const NOISE_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock|\.DS_Store|Thumbs\.db|tsconfig\.tsbuildinfo)$|\.min\.(js|css)$|\.map$/i;
const PRIORITY_FILE = /(^|\/)(package\.json|README(\.md)?|tsconfig\.json|next\.config\.[mc]?js|vite\.config\.[a-z]+|tailwind\.config\.[a-z]+|netlify\.toml|vercel\.json|requirements\.txt|pyproject\.toml|Dockerfile|docker-compose\.ya?ml|\.env\.example|index\.html|manifest\.json)$/i;

// Masquage des secrets restants dans les fichiers lus (en plus de l'exclusion des fichiers sensibles).
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\b(?:sk|pk|rk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];
const KEY_VALUE = /\b((?:[A-Za-z0-9_]*(?:api[_-]?key|secret|token|passw(?:or)?d|private[_-]?key|credential)[A-Za-z0-9_]*))(\s*[:=]\s*)(["']?)([^\s"',;]{8,})\3/gi;
export function maskSecrets(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, () => { count++; return "[SECRET_MASQUÉ]"; });
  out = out.replace(KEY_VALUE, (_m, k: string, sep: string, q: string) => { count++; return `${k}${sep}${q}[SECRET_MASQUÉ]${q}`; });
  return { text: out, count };
}

interface Entry { name: string; method: number; compSize: number; size: number; localOffset: number; isDir: boolean; isSymlink: boolean }

function readEntries(buf: Uint8Array, L: ZipLimits): { entries: Entry[] } | { error: ZipAnalysis } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 22) return { error: reject("NOT_ZIP") };
  const sig = dv.getUint32(0, true);
  if (sig !== 0x04034b50 && sig !== 0x06054b50) return { error: reject("NOT_ZIP") };
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return { error: reject("NOT_ZIP") };
  const total = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOffset = dv.getUint32(eocd + 16, true);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return { error: reject("ZIP64") };
  if (total === 0) return { error: reject("EMPTY") };
  if (total > L.maxEntries) return { error: reject("TOO_MANY_ENTRIES") };
  if (cdOffset + cdSize > eocd) return { error: reject("CORRUPT") };
  const entries: Entry[] = [];
  let p = cdOffset;
  const utf8 = new TextDecoder("utf-8");
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== 0x02014b50) return { error: reject("CORRUPT") };
    const madeBy = dv.getUint16(p + 4, true), flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nLen = dv.getUint16(p + 28, true), xLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
    const ext = dv.getUint32(p + 38, true), localOffset = dv.getUint32(p + 42, true);
    if (p + 46 + nLen + xLen + cLen > buf.byteLength) return { error: reject("CORRUPT") };
    if (flags & 0x1) return { error: reject("ENCRYPTED") };
    if (compSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) return { error: reject("ZIP64") };
    const raw = utf8.decode(buf.subarray(p + 46, p + 46 + nLen));
    const name = raw.replace(/\\/g, "/");
    const isDir = name.endsWith("/");
    const unixMode = (madeBy >> 8) === 3 ? (ext >>> 16) & 0o170000 : 0;
    entries.push({ name, method, compSize, size, localOffset, isDir, isSymlink: unixMode === 0o120000 });
    p += 46 + nLen + xLen + cLen;
  }
  return { entries };
}

// Un seul chemin dangereux refuse TOUTE l'archive : on ne tente jamais de « nettoyer » une archive hostile.
function unsafePath(name: string, L: ZipLimits): boolean {
  if (!name || name.includes("\0") || /[\u0001-\u001f]/.test(name)) return true;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.startsWith("//")) return true;
  const segs = name.split("/").filter((s, i, a) => !(s === "" && i === a.length - 1));
  if (segs.some(s => s === ".." || s === "." && false)) return true;
  if (segs.length > L.maxDepth * 4) return true; // profondeur absurde : archive hostile (au-delà de maxDepth : simplement ignoré)
  return false;
}

export function analyzeZip(input: Uint8Array, limits: Partial<ZipLimits> = {}): ZipAnalysis {
  const L: ZipLimits = { ...DEFAULT_ZIP_LIMITS, ...limits };
  if (input.byteLength > L.maxArchiveBytes) return reject("TOO_LARGE");
  const parsed = readEntries(input, L);
  if ("error" in parsed) return parsed.error;
  const { entries } = parsed;

  const stats: ZipStats = { entries: entries.length, filesRead: 0, ignored: 0, sensitiveExcluded: 0, executablesSkipped: 0, nestedArchivesSkipped: 0, binarySkipped: 0, tooBigSkipped: 0, symlinksSkipped: 0, secretsMasked: 0, truncated: false };
  let totalDeclared = 0;
  for (const e of entries) {
    if (unsafePath(e.name, L)) return reject("PATH_TRAVERSAL");
    totalDeclared += e.size;
    if (totalDeclared > L.maxTotalBytes) return reject("BOMB");
    if (e.method !== 0 && e.compSize > 0 && e.size > 1024 * 1024 && e.size / e.compSize > L.maxRatio) return reject("BOMB");
  }

  const tree: string[] = [];
  const candidates: { name: string; entry: Entry; score: number }[] = [];
  for (const e of entries) {
    if (e.isDir) continue;
    const segs = e.name.split("/");
    if (e.isSymlink) { stats.symlinksSkipped++; continue; } // jamais suivi
    if (SENSITIVE_NAME.test(e.name)) { stats.sensitiveExcluded++; tree.push(`${e.name}  [exclu : fichier sensible]`); continue; }
    if (segs.slice(0, -1).some(s => IGNORED_DIRS.has(s)) || NOISE_FILE.test(e.name) || segs.length > L.maxDepth) { stats.ignored++; continue; }
    if (EXECUTABLE_EXT.test(e.name)) { stats.executablesSkipped++; tree.push(`${e.name}  [exécutable : non lu]`); continue; }
    if (NESTED_ARCHIVE_EXT.test(e.name)) { stats.nestedArchivesSkipped++; tree.push(`${e.name}  [archive imbriquée : non ouverte]`); continue; }
    if (BINARY_ASSET_EXT.test(e.name)) { stats.binarySkipped++; tree.push(`${e.name}  [fichier binaire, ${e.size} octets]`); continue; }
    if (!TEXT_EXT.test(e.name) && !PRIORITY_FILE.test(e.name)) { stats.binarySkipped++; tree.push(`${e.name}  [type non pris en charge]`); continue; }
    if (e.size > L.maxFileBytes) { stats.tooBigSkipped++; tree.push(`${e.name}  [trop volumineux : ${e.size} octets, non lu]`); continue; }
    tree.push(e.name);
    const depthPenalty = segs.length * 2;
    const score = (PRIORITY_FILE.test(e.name) ? 1000 : 0) + (/(^|\/)(src|app|pages|components|lib|api|server)\//i.test(e.name) ? 200 : 0) - depthPenalty - Math.min(e.size / 2000, 100);
    candidates.push({ name: e.name, entry: e, score });
  }
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const dv = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const parts: string[] = [];
  let used = 0;
  for (const c of candidates) {
    if (used >= L.digestChars) { stats.truncated = true; break; }
    const e = c.entry;
    const lo = e.localOffset;
    if (lo + 30 > input.byteLength || dv.getUint32(lo, true) !== 0x04034b50) return reject("CORRUPT");
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    if (start + e.compSize > input.byteLength) return reject("CORRUPT");
    const data = input.subarray(start, start + e.compSize);
    let content: Uint8Array;
    try {
      content = e.method === 0 ? data : e.method === 8 ? inflateRawSync(data, { maxOutputLength: e.size + 1 }) : new Uint8Array(0);
    } catch { return reject("BOMB"); } // dépasse la taille déclarée ou flux invalide
    if (e.method !== 0 && e.method !== 8) { stats.binarySkipped++; continue; }
    if (content.byteLength !== e.size) return reject("CORRUPT"); // taille déclarée ≠ taille réelle
    if (content.subarray(0, 1000).includes(0)) { stats.binarySkipped++; continue; }
    let text = new TextDecoder("utf-8").decode(content);
    const masked = maskSecrets(text); text = masked.text; stats.secretsMasked += masked.count;
    if (text.length > L.perFileChars) { text = text.slice(0, L.perFileChars) + "\n[… fichier tronqué]"; stats.truncated = true; }
    text = text.replace(/<\/?(noxia_)?(zip_)?(archive|file)[_a-z]*>/gi, m => m.replace(/</g, "‹")); // empêche de fermer le bloc de données délimité
    const block = `=== ${c.name} ===\n${text}\n`;
    if (used + block.length > L.digestChars) { stats.truncated = true; continue; }
    parts.push(block); used += block.length; stats.filesRead++;
  }

  const header = [
    `Archive ZIP : ${stats.entries} entrée(s) ; ${stats.filesRead} fichier(s) lus ; ${stats.ignored} ignorés (dépendances, compilation, verrous) ; ${stats.sensitiveExcluded} sensible(s) exclus ; ${stats.executablesSkipped} exécutable(s) et ${stats.nestedArchivesSkipped} archive(s) imbriquée(s) non ouverts ; ${stats.binarySkipped} binaire(s)/non pris en charge ; ${stats.tooBigSkipped} trop volumineux ; ${stats.secretsMasked} secret(s) masqué(s).${stats.truncated ? " Le contenu a été réduit pour respecter les limites : analyse partielle." : ""}`,
    `Arborescence (fichiers retenus et exclus, ${Math.min(tree.length, 300)} sur ${tree.length}) :`,
    ...tree.slice(0, 300),
  ].join("\n");
  return { ok: true, digest: `${header}\n\n${parts.join("\n")}`.trimEnd(), stats };
}
