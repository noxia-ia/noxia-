import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

const tools: { title: string; desc: string; href: string; icon: IconName }[] = [
  { title: "NOXIA Audio", desc: "Voix et ambiances sonores générées par l’IA.", href: "/dashboard/asmr", icon: "wave" },
  { title: "NOXIA Music", desc: "Compose des morceaux à partir d’une idée.", href: "/dashboard/music", icon: "music" },
  { title: "Mini-Series", desc: "Enchaîne plusieurs scènes pour raconter une histoire.", href: "/dashboard/series", icon: "tv" },
  { title: "NOXIA Code", desc: "Génère et explique du code.", href: "/dashboard/code", icon: "code" },
];

export default function ToolsPage() {
  return (
    <div className="noxia-dashboard">
      <div className="noxia-section-heading"><h1>Autres outils</h1></div>
      <div className="noxia-module-grid">
        {tools.map(t => (
          <Link key={t.href} href={t.href} className="noxia-module-card tools">
            <div className="noxia-tool-icon"><Icon name={t.icon} size={34} /></div>
            <h3>{t.title}</h3>
            <p>{t.desc}</p>
            <span className="noxia-gradient-btn">Ouvrir <Icon name="arrow" size={14} /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
