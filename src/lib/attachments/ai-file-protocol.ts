/**
 * Protocole léger pour que l'IA demande la génération d'un fichier téléchargeable.
 *
 * Dans sa réponse, l'assistant peut inclure un bloc délimité :
 *
 * ```noxia-file
 * kind: zip
 * name: mon-projet.zip
 * ---
 * path: README.md
 * content:
 * # Hello
 * ---
 * path: src/main.ts
 * content:
 * console.log("hi");
 * ```
 *
 * ou pour un PDF :
 *
 * ```noxia-file
 * kind: pdf
 * name: rapport.pdf
 * title: Rapport d'analyse
 * ---
 * Ligne 1 du document
 * Ligne 2...
 * ```
 *
 * Le backend parse ces blocs, génère le fichier, le stocke dans Supabase Storage,
 * et remplace le bloc par un lien de téléchargement sécurisé.
 */

import type { ZipEntry } from "./generate";

export interface ParsedZipRequest {
  kind: "zip";
  name: string;
  entries: ZipEntry[];
}

export interface ParsedPdfRequest {
  kind: "pdf";
  name: string;
  title: string;
  lines: string[];
}

export type ParsedFileRequest = ParsedZipRequest | ParsedPdfRequest;

const BLOCK_RE = /```noxia-file\s*\n([\s\S]*?)```/gi;

export function extractFileRequests(reply: string): { cleaned: string; requests: ParsedFileRequest[] } {
  const requests: ParsedFileRequest[] = [];
  let cleaned = reply;

  cleaned = cleaned.replace(BLOCK_RE, (_full, body: string) => {
    const parsed = parseBlock(String(body));
    if (parsed) {
      requests.push(parsed);
      // Placeholder remplacé après génération côté serveur
      return `\n[NOXIA_FILE_PENDING:${requests.length - 1}]\n`;
    }
    return _full;
  });

  return { cleaned, requests };
}

function parseBlock(body: string): ParsedFileRequest | null {
  const lines = body.split(/\r?\n/);
  let kind: "zip" | "pdf" | null = null;
  let name = "";
  let title = "";
  let i = 0;

  // Header metadata jusqu'au premier ---
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;
    if (line === "---") break;
    const m = line.match(/^(kind|name|title)\s*:\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "kind" && (val === "zip" || val === "pdf")) kind = val;
    else if (key === "name") name = val;
    else if (key === "title") title = val;
  }

  if (!kind || !name) return null;

  if (kind === "pdf") {
    const contentLines = lines.slice(i).map((l) => l.replace(/\s+$/, ""));
    // Retirer lignes vides en tête/queue
    while (contentLines.length && !contentLines[0].trim()) contentLines.shift();
    while (contentLines.length && !contentLines[contentLines.length - 1].trim()) contentLines.pop();
    if (contentLines.length === 0) return null;
    return { kind: "pdf", name, title: title || name, lines: contentLines.slice(0, 2000) };
  }

  // ZIP : segments path / content
  const entries: ZipEntry[] = [];
  let path = "";
  let contentBuf: string[] = [];
  let inContent = false;

  const flush = () => {
    if (path && contentBuf.length) {
      const text = contentBuf.join("\n");
      entries.push({ path: path.replace(/^\/+/, ""), data: new TextEncoder().encode(text) });
    }
    path = "";
    contentBuf = [];
    inContent = false;
  };

  while (i < lines.length) {
    const line = lines[i];
    i++;
    const t = line.trim();
    if (t === "---") {
      flush();
      continue;
    }
    const pm = t.match(/^path\s*:\s*(.+)$/i);
    if (pm) {
      flush();
      path = pm[1].trim();
      inContent = false;
      continue;
    }
    if (/^content\s*:\s*$/i.test(t)) {
      inContent = true;
      contentBuf = [];
      continue;
    }
    if (inContent) contentBuf.push(line);
  }
  flush();

  if (entries.length === 0) return null;
  return { kind: "zip", name, entries: entries.slice(0, 50) };
}

/** Remplace les placeholders par les liens de téléchargement. */
export function injectDownloadLinks(
  text: string,
  results: Array<{ index: number; ok: true; downloadPath: string; name: string } | { index: number; ok: false; message: string }>
): string {
  let out = text;
  for (const r of results) {
    const token = `[NOXIA_FILE_PENDING:${r.index}]`;
    if (r.ok) {
      out = out.replace(
        token,
        `\n📎 **Fichier généré** : [${r.name}](${r.downloadPath})\n`
      );
    } else {
      out = out.replace(token, `\n⚠️ Impossible de générer le fichier : ${r.message}\n`);
    }
  }
  return out;
}
