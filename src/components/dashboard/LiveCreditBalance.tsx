"use client";
import { useCreditBalance } from "@/hooks/use-credit-balance";

// Solde mis à jour en direct (Realtime sur profiles.credits). La valeur initiale vient du serveur.
export function LiveCreditBalance({ userId, initialCredits }: { userId: string; initialCredits: number }) {
  const credits = useCreditBalance(userId, initialCredits);
  return <span aria-live="polite">{credits}</span>;
}
