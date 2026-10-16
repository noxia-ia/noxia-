"use client";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { setThemeAction } from "@/app/dashboard/theme-actions";

// Bouton ☀/🌙 : sur toutes les pages. `persist` = enregistre aussi le choix dans le compte (pages connectées).
export function ThemeToggle({ persist = false, className = "" }: { persist?: boolean; className?: string }) {
  const [light, setLight] = useState(false);
  const [, start] = useTransition();
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setLight(root.classList.contains("noxia-theme-light"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  function toggle() {
    const next = !light;
    document.documentElement.classList.toggle("noxia-theme-light", next);
    try { localStorage.setItem("noxia-theme", next ? "light" : "dark"); } catch { /* stockage indisponible */ }
    setLight(next);
    if (persist) start(() => { void setThemeAction(next ? "light" : "dark"); });
  }
  const label = light ? "Passer au thème sombre" : "Passer au thème clair";
  return (
    <button type="button" onClick={toggle} className={`nx-icon-btn ${className}`} aria-label={label} title={label}>
      <Icon name={light ? "moon" : "sun"} size={20} />
    </button>
  );
}
