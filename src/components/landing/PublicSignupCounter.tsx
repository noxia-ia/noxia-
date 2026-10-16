"use client";

import { useEffect, useState } from "react";

/**
 * Compteur d'inscrits pour la landing / interface publique.
 * Agrégat anonyme uniquement (GET /api/public/signup-count).
 */
export function PublicSignupCounter({
  label = "créateurs déjà inscrits",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/signup-count")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d.count === "number") setCount(d.count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (count == null) return null;

  return (
    <p className={className}>
      <span className="font-display text-noxia-silver">
        {count.toLocaleString("fr-FR")}
      </span>{" "}
      <span className="text-noxia-ash">{label}</span>
    </p>
  );
}
