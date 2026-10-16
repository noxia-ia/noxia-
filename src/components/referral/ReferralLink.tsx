"use client";
import { useState } from "react";

// Lien de parrainage + bouton de copie rapide (et partage natif quand le navigateur le permet).
export function ReferralLink({ link, code }: { link: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch { /* copie impossible : le lien reste visible */ } document.body.removeChild(t); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div>
      <label htmlFor="ref-link" className="mb-1 block text-sm text-noxia-ash">Ton lien unique</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="ref-link" readOnly value={link} onFocus={e => e.currentTarget.select()} className="min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-3 text-sm text-noxia-silver" />
        <button type="button" onClick={() => copy(link)} className="min-h-11 shrink-0 rounded-sm bg-noxia-violet px-5 text-sm text-white" aria-live="polite">{copied ? "Lien copié ✓" : "Copier le lien"}</button>
        {canShare && <button type="button" onClick={() => navigator.share({ title: "NOXIA AI", text: "Rejoins-moi sur NOXIA AI : 17 crédits offerts à l'inscription.", url: link }).catch(() => {})} className="min-h-11 shrink-0 rounded-sm border border-noxia-silver/20 px-5 text-sm text-noxia-silver">Partager</button>}
      </div>
      <p className="mt-2 text-xs text-noxia-ash">Ton code : <button type="button" onClick={() => copy(code)} className="font-mono text-noxia-silver underline">{code}</button></p>
    </div>
  );
}
