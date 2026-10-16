import type { NavItem } from "@/types";
export const site = { name:"NOXIA AI", slogan:"Imaginez. Créez. Innovez." };
export const mainNav: NavItem[] = [
  { label:"Accueil", href:"/#accueil" }, { label:"Fonctionnalités", href:"/#fonctionnalites" },
  { label:"NOXIA", href:"/#noxia" }, { label:"Tarifs", href:"/pricing" }, { label:"Connexion", href:"/login" },
];
export const footerLinks: NavItem[] = [
  ...mainNav.slice(0,4), { label:"Conditions", href:"#" }, { label:"Confidentialité", href:"#" }, { label:"Contact", href:"/contact" },
];
// Menu du dashboard, aligné sur la maquette. Les modules secondaires (Audio, Music, Mini-Series, Code) sont regroupés dans /dashboard/tools.
export const sidebarNav: NavItem[] = [
  { label:"Accueil", href:"/dashboard" }, { label:"Créer une image", href:"/dashboard/image" }, { label:"Créer une vidéo", href:"/dashboard/video" }, { label:"Mini-séries", href:"/dashboard/series" },
  { label:"Parler avec NOXIA", href:"/dashboard/agents" }, { label:"Mes créations", href:"/dashboard/creations" }, { label:"Mes crédits", href:"/dashboard/credits" },
  { label:"Récompenses", href:"/dashboard/rewards" }, { label:"Parrainage", href:"/dashboard/parrainage" }, { label:"Historique", href:"/dashboard/creations?tab=conversation" }, { label:"Paramètres", href:"/dashboard/settings" },
];
