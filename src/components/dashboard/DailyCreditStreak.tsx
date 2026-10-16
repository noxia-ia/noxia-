import { Icon } from "@/components/ui/Icon";
import { DAILY_REWARDS } from "@/lib/daily-streak";

// Carte « Ton streak quotidien » : affichage seul. Les jours < jour courant sont validés ; la récupération se fait depuis la carte Bonus.
export function DailyCreditStreak({ day }: { day: number }) {
  const current = Math.min(7, Math.max(1, day));
  return (
    <section className="noxia-streak-card" aria-labelledby="daily-streak-title">
      <div className="noxia-streak-head">
        <Icon name="flame" size={38} className="noxia-flame" />
        <div>
          <h2 id="daily-streak-title">Ton streak quotidien</h2>
          <p>Reste connecté chaque jour<br />pour gagner plus de crédits !</p>
        </div>
      </div>
      <ol className="noxia-streak-days" aria-label="Récompenses des sept jours">
        {DAILY_REWARDS.map((reward, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "now" : "next";
          return (
            <li key={n} className={`noxia-streak-day ${state}`} aria-current={state === "now" ? "step" : undefined}>
              <span className="noxia-streak-check"><Icon name="check" size={13} /></span>
              <span>Jour {n}</span>
              <b>+{reward}</b>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
