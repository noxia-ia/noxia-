"use client";
import { useEffect } from "react";

// `hasPref` = le compte a déjà une préférence de thème en base. Sinon, on garde le choix local (bouton ☀/🌙 avant connexion).
export function ThemeSync({ theme, hasPref = true }: { theme: "dark" | "light" | "system"; hasPref?: boolean }) {
  useEffect(() => {
    if (!hasPref) return;
    const root = document.documentElement;
    const apply = () => {
      const light = theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
      root.classList.toggle("noxia-theme-light", light);
      try { localStorage.setItem("noxia-theme", light ? "light" : "dark"); } catch { /* stockage indisponible */ }
    };
    apply();
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, [theme, hasPref]);
  return null;
}
