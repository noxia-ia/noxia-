"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { PublicBanner } from "@/lib/banners";

const DISMISS_KEY = "noxia-ad-dismissed";
const SEEN_KEY = "noxia-ad-seen";
const readList = (key: string): string[] => { try { const v = JSON.parse(sessionStorage.getItem(key) ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } };
const writeList = (key: string, list: string[]) => { try { sessionStorage.setItem(key, JSON.stringify(list)); } catch { /* stockage indisponible : valable tant que la page est ouverte */ } };

// Compte un affichage ou un clic (visible uniquement par l'administrateur). Un échec réseau n'a aucune conséquence pour l'utilisateur.
function track(id: string, kind: "impression" | "click") {
  try { void fetch("/api/banners/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, kind }), keepalive: true }).catch(() => undefined); } catch { /* ignoré */ }
}

// Bande d'annonces QUI DÉFILE (de droite à gauche, en boucle) au-dessus de la zone de saisie. Pause au survol et au clavier ; avec « moins de mouvement » le texte ne défile plus
// et la bande se fait au doigt. Fermeture : valable pour la session en cours seulement.
export function AdBanner({ banners }: { banners: PublicBanner[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => { setDismissed(readList(DISMISS_KEY)); }, []);
  const visible = banners.filter(b => !dismissed.includes(b.id));
  const key = visible.map(b => b.id).join(",");
  useEffect(() => { // un affichage compté une seule fois par bande et par session
    const seen = readList(SEEN_KEY);
    const fresh = visible.filter(b => !seen.includes(b.id));
    if (!fresh.length) return;
    writeList(SEEN_KEY, [...seen, ...fresh.map(b => b.id)]);
    fresh.forEach(b => track(b.id, "impression"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (visible.length === 0) return null;

  const copies = visible.length >= 3 ? 2 : 4; // les copies rendent la boucle continue, sans trou
  const seconds = Math.max(24, visible.length * 14);
  function close() { const next = [...dismissed, ...visible.map(b => b.id)]; setDismissed(next); writeList(DISMISS_KEY, next); }
  const trackStyle = { "--reps": copies, animationDuration: `${seconds}s` } as CSSProperties;

  return (
    <aside className="nx-ad nx-ad-ticker" aria-label="Annonces">
      <div className="nx-ad-viewport">
        <div className="nx-ad-track" style={trackStyle}>
          {Array.from({ length: copies }).flatMap((_, c) => visible.map(b => (
            <div className="nx-ad-item" key={`${c}-${b.id}`} aria-hidden={c > 0 ? true : undefined}>
              {b.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="nx-ad-img" />}
              <span className="nx-ad-label">{b.label}</span>
              <strong>{b.title}</strong>
              {b.body && <small>{b.body}</small>}
              <a href={b.link_url} target="_blank" rel="sponsored noopener noreferrer" className="nx-ad-cta" tabIndex={c > 0 ? -1 : undefined} onClick={() => track(b.id, "click")}>{b.cta_label}</a>
            </div>
          )))}
        </div>
      </div>
      <button type="button" onClick={close} className="nx-ad-close" aria-label="Fermer la bande">✕</button>
    </aside>
  );
}
