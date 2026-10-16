import type { Metadata } from "next";
import "@/styles/globals.css";
import { SupportBubble } from "@/components/support/SupportBubble";
export const metadata: Metadata = {
  title: "NOXIA AI — Imaginez. Créez. Innovez.",
  description: "NOXIA AI, une intelligence artificielle proche de l'humain, bienveillante et à l'écoute.",
};
// Applique le thème clair AVANT l'affichage (pas de flash). Sombre par défaut. Le choix est mémorisé dans ce navigateur.
const themeInit = `(function(){try{if(localStorage.getItem("noxia-theme")==="light"){document.documentElement.classList.add("noxia-theme-light")}}catch(e){}})();`;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head><body>{children}<SupportBubble /></body></html>;
}
