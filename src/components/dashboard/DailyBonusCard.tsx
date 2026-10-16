"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimDailyCreditAction } from "@/app/dashboard/daily-actions";
import { Icon } from "@/components/ui/Icon";
import { DAILY_REWARDS } from "@/lib/daily-streak";

// Carte « Bonus quotidien ». Le crédit réel est attribué côté serveur (fonction SQL) ; ici on déclenche l'action puis on rafraîchit la page.
export function DailyBonusCard({ day, claimed }: { day: number; claimed: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState(claimed);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const safeDay = Math.min(7, Math.max(1, day));

  function claim() {
    startTransition(async () => {
      setMessage(null);
      const result = await claimDailyCreditAction();
      if (!result.ok) { setMessage(result.message); return; }
      setDone(true);
      setMessage(result.alreadyClaimed ? "Bonus déjà récupéré aujourd’hui." : `+${result.creditsGranted} crédits ajoutés.`);
      router.refresh(); // met à jour le streak et le solde
    });
  }

  return (
    <aside className="noxia-bonus-card" aria-labelledby="daily-bonus-title">
      <div className="noxia-bonus-head"><Icon name="gift" size={22} /><strong id="daily-bonus-title">Bonus quotidien</strong></div>
      <div className="noxia-bonus-day">Jour {safeDay} / 7</div>
      <b>+{DAILY_REWARDS[safeDay - 1]} crédits</b>
      <div className="noxia-dots" aria-hidden>{[1, 2, 3, 4, 5, 6, 7].map(n => <i key={n} className={n < safeDay ? "on" : n === safeDay ? "now" : ""} />)}</div>
      <button type="button" onClick={claim} disabled={isPending || done} className="noxia-gradient-btn">
        {isPending ? "Validation…" : done ? "Déjà récupéré" : "Récupérer mes crédits"}
      </button>
      {message && <p className="noxia-bonus-msg" role="status" aria-live="polite">{message}</p>}
    </aside>
  );
}
