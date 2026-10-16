import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { getCurrentSubscription, effectiveStatus } from "@/lib/subscription";
import { nextClaimDay } from "@/lib/daily-streak";
import { fetchCreations, type Creation } from "@/lib/creations";
import { LiveCreditBalance } from "@/components/dashboard/LiveCreditBalance";
import { CreditExpiry } from "@/components/credits/CreditExpiry";
import { getCreditStatus } from "@/lib/credit-status";
import { DailyBonusCard } from "@/components/dashboard/DailyBonusCard";
import { DailyCreditStreak } from "@/components/dashboard/DailyCreditStreak";
import { Icon, type IconName } from "@/components/ui/Icon";

const moduleCards = [
  { title: "Créer une image", desc: "Génère des images incroyables avec l’IA.", href: "/dashboard/image", icon: "image", tone: "image", cta: "Commencer" },
  { title: "Créer une vidéo", desc: "Donne vie à tes idées en vidéo avec l’IA.", href: "/dashboard/video", icon: "video", tone: "video", cta: "Commencer" },
  { title: "Parler avec NOXIA", desc: "Discute, pose des questions, obtiens des réponses.", href: "/dashboard/agents", icon: "mic", tone: "voice", cta: "Commencer" },
  { title: "Autres outils", desc: "Audio, musique, séries, code et bien plus encore.", href: "/dashboard/tools", icon: "sparkle", tone: "tools", cta: "Explorer" },
] as const satisfies readonly { title: string; desc: string; href: string; icon: IconName; tone: string; cta: string }[];

const perks = ["Crédits supplémentaires", "Modèles exclusifs", "Générations plus rapides", "Accès aux nouveautés en avance"];
const values: { icon: IconName; title: string; text: string }[] = [
  { icon: "zap", title: "Rapide", text: "Résultats en quelques secondes" },
  { icon: "lock", title: "Sécurisé", text: "Vos données sont protégées" },
  { icon: "sparkle", title: "Innovant", text: "Toujours plus de possibilités" },
  { icon: "user", title: "Accessible", text: "Sur tous vos appareils" },
];
const CATEGORY_ICON: Record<string, IconName> = { image: "image", video: "video", audio: "wave", asmr: "wave", music: "music", code: "code", conversation: "chat" };

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return "À l’instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Il y a ${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `Il y a ${days} jour${days > 1 ? "s" : ""}`;
}

export default async function DashboardOverview() {
  const { supabase, user, profile } = await getSessionProfile();
  const sub = await getCurrentSubscription(supabase, user.id);
  const status = effectiveStatus(sub);
  const fullName = profile?.full_name || (user.user_metadata?.full_name as string | undefined) || "";
  const firstName = fullName.split(/[\s@]/)[0] || "toi";
  const { data: dailyStreak } = await supabase.from("daily_credit_streaks").select("streak_day,last_claim_date,last_claim_at").eq("user_id", user.id).maybeSingle<{ streak_day: number; last_claim_date: string | null; last_claim_at: string | null }>();
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const lastClaimAt = dailyStreak?.last_claim_at ?? null;
  const claimedToday = !!lastClaimAt && now.getTime() - Date.parse(lastClaimAt) < 24 * 60 * 60 * 1000;
  const day = nextClaimDay(dailyStreak ? { streakDay: dailyStreak.streak_day, lastClaimAt } : null, now);
  const creditStatus = await getCreditStatus(supabase, profile?.credits ?? 0);
  const credits = creditStatus.balance;

  // « +N » : crédits gagnés aujourd'hui (récompenses). Lecture RLS de reward_events ; en cas d'échec, la pastille est simplement masquée.
  const { data: todayEvents } = await supabase.from("reward_events").select("credits").eq("user_id", user.id).gte("created_at", `${todayUtc}T00:00:00Z`).returns<{ credits: number }[]>();
  const earnedToday = (todayEvents ?? []).reduce((sum, e) => sum + (e.credits ?? 0), 0);

  // Dernières créations réelles de l'utilisateur (même source que « Mes créations »).
  const recent = await fetchCreations(supabase, "all", null, 4);
  const latest: Creation[] = recent.ok ? recent.items.slice(0, 4) : [];

  return <div className="noxia-dashboard">
    <section className="noxia-welcome-grid">
      <div className="noxia-hero-card">
        <div className="noxia-hero-art" aria-hidden />
        <div className="noxia-hero-copy">
          <p>Bonjour {firstName} <span aria-hidden>👋</span></p>
          <h1>Crée, imagine, explore…<br />avec <b>NOXIA</b></h1>
          <span>Ton assistant IA tout-en-un pour générer des images, des vidéos, parler, et bien plus encore.</span>
          <Link href="/dashboard/image" className="noxia-gradient-btn">Découvrir NOXIA <Icon name="arrow" size={14} /></Link>
        </div>
        <p className="noxia-hero-quote">« Chaque idée<br />est une nouvelle<br />création. »</p>
      </div>
      <div className="noxia-top-right">
        <aside className="noxia-credit-card">
          <div className="noxia-credit-top"><span className="noxia-round-icon"><Icon name="coin" size={20} /></span><strong>Mes crédits</strong></div>
          <div className="noxia-credit-number"><LiveCreditBalance userId={user.id} initialCredits={credits} />{earnedToday > 0 && <span className="noxia-credit-plus" title="Gagnés aujourd’hui">+{earnedToday}</span>}</div>
          <small>Crédits disponibles</small>
          <CreditExpiry status={creditStatus} className="mt-1" />
          <Link href="/dashboard/credits" className="noxia-gradient-btn">Acheter des crédits</Link>
        </aside>
        <DailyBonusCard day={day} claimed={claimedToday} />
      </div>
    </section>

    {status === "expired" && <div role="alert" className="noxia-alert">Votre abonnement a expiré. <Link href="/dashboard/abonnements">Renouveler</Link></div>}

    <section className="noxia-content-grid">
      <div className="noxia-main-column">
        <div className="noxia-section-heading"><h2>Choisis ton module</h2></div>
        <div className="noxia-module-grid">{moduleCards.map(card => (
          <Link key={card.href} href={card.href} className={`noxia-module-card ${card.tone}`}>
            <div className="noxia-module-visual" />
            <div className="noxia-module-icon"><Icon name={card.icon} size={22} /></div>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
            <span className="noxia-gradient-btn">{card.cta} <Icon name="arrow" size={14} /></span>
          </Link>
        ))}</div>
        <div className="noxia-special-card">
          <div className="noxia-special-copy">
            <small><Icon name="crown" size={18} /> Offre spéciale</small>
            <h2>Deviens Premium dès maintenant !</h2>
            <p>Plus de crédits, des modèles exclusifs, des outils avancés et bien plus encore.</p>
            <Link href="/dashboard/abonnements" className="noxia-gradient-btn">Découvrir les avantages</Link>
          </div>
          <ul>{perks.map(p => <li key={p}><span><Icon name="check" size={12} /></span>{p}</li>)}</ul>
          <div className="noxia-gift" aria-hidden />
        </div>
      </div>
      <aside className="noxia-right-column">
        <DailyCreditStreak day={day} />
        <div className="noxia-creations-card">
          <div className="noxia-side-heading"><h3>Dernières créations</h3><Link href="/dashboard/creations">Voir tout <Icon name="arrow" size={12} /></Link></div>
          {latest.length === 0 && <p className="noxia-empty">Rien ici pour l’instant. <Link href="/dashboard/image">Crée ta première image</Link>.</p>}
          {latest.map((c, i) => (
            <Link href={c.openHref ?? "/dashboard/creations"} className="noxia-creation-row" key={c.key}>
              <div className={`noxia-thumb t${i}`}>
                {c.mediaKind === "image" && c.mediaUrl
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.mediaUrl} alt="" loading="lazy" />
                  : <Icon name={CATEGORY_ICON[c.category] ?? "sparkle"} size={18} />}
              </div>
              <div><strong>{c.typeLabel} - {c.title}</strong><small>{timeAgo(c.createdAt)}</small></div>
              <Icon name={CATEGORY_ICON[c.category] ?? "sparkle"} size={17} />
            </Link>
          ))}
        </div>
      </aside>
    </section>

    <footer className="noxia-value-strip">{values.map(v => (
      <div key={v.title}><span className="noxia-value-icon"><Icon name={v.icon} size={20} /></span><b>{v.title}</b><small>{v.text}</small></div>
    ))}</footer>
  </div>;
}
