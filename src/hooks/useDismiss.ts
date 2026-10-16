"use client";
import { useEffect, type RefObject } from "react";

// Ferme un menu flottant : clic / toucher à l'extérieur et touche Échap (le focus revient alors au bouton déclencheur).
export function useDismiss(open: boolean, onClose: () => void, refs: RefObject<HTMLElement | null>[], returnFocusTo?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (refs.some(r => r.current?.contains(t))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); onClose(); returnFocusTo?.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

// Navigation clavier d'un menu (↑ ↓ Début Fin) sur les éléments [role=menuitem] non désactivés.
export function menuKeyDown(e: React.KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
  if (items.length === 0) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next]?.focus();
}
