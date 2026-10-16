"use client";
import { useState } from "react";
import type { GenerateCodeResult } from "@/lib/ai/types";

function treeLines(paths: string[]) {
  const seen = new Set<string>();
  const out: { label: string; depth: number; path?: string }[] = [{ label: "project/", depth: 0 }];
  [...paths].sort().forEach(p => {
    const parts = p.split("/");
    parts.forEach((part, i) => {
      const key = parts.slice(0, i + 1).join("/");
      if (i < parts.length - 1) { if (!seen.has(key)) { seen.add(key); out.push({ label: part + "/", depth: i + 1 }); } }
      else out.push({ label: part, depth: i + 1, path: p });
    });
  });
  return out;
}

export function ResultPanel({ result }: { result: GenerateCodeResult | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  if (!result) return <p className="text-sm text-noxia-ash">Le résultat de ta génération apparaîtra ici.</p>;
  const file = result.files.find(f => f.path === open) ?? null;
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied("ok"); } catch { setCopied("fail"); }
    setTimeout(() => setCopied(null), 2000);
  }
  const btn = "min-h-11 rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white";

  if (file) return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpen(null)} className={btn}>← Retour au résultat</button>
        <button onClick={() => copy(file.content)} className={btn}>{copied === "ok" ? "Copié ✓" : copied === "fail" ? "Copie impossible" : "Copier le code"}</button>
      </div>
      <p className="break-all font-mono text-xs text-noxia-ash">{file.path} · {file.language}</p>
      <pre className="max-w-full overflow-x-auto rounded-sm border border-noxia-silver/15 bg-noxia-night p-4 text-xs leading-relaxed text-noxia-silver"><code>{file.content}</code></pre>
    </div>
  );
  return (
    <div className="min-w-0 space-y-4">
      <p className="whitespace-pre-wrap text-noxia-silver">{result.message}</p>
      {result.files.length > 0 && (
        <ul className="rounded-sm border border-noxia-silver/15 bg-noxia-night p-3 font-mono text-sm">
          {treeLines(result.files.map(f => f.path)).map((l, i) => (
            <li key={i} style={{ paddingLeft: l.depth * 16 }} className="py-0.5">
              {l.path
                ? <button onClick={() => setOpen(l.path!)} className="min-h-11 break-all text-left text-noxia-violet underline">{l.label}</button>
                : <span className="text-noxia-ash">{l.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
