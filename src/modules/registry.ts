import type { NoxiaModule } from "@/types";
// Registre des capacités de NOXIA. Les identifiants techniques restent stables pour éviter de casser les données existantes.
export const modules: NoxiaModule[] = [
  { id:"code", name:"NOXIA Code", icon:"💻", description:"Développement Full-Stack assisté par IA.", href:"/dashboard/code", status:"live" },
  { id:"asmr", name:"NOXIA Audio", icon:"🎧", description:"Création de concepts, prompts et contenus audio.", href:"/dashboard/asmr", status:"live" },
  { id:"music", name:"NOXIA Music", icon:"🎵", description:"Création de musiques originales à partir d’un prompt.", href:"/dashboard/music", status:"live" },
  { id:"video", name:"NOXIA Video", icon:"🎬", description:"Création et transformation de contenus vidéo.", href:"/dashboard/video", status:"live" },
  { id:"image", name:"NOXIA Image", icon:"🖼️", description:"Création d'images par IA à partir d'un prompt.", href:"/dashboard/image", status:"live" },
  { id:"agents", name:"NOXIA Agents", icon:"🤖", description:"Agents IA spécialisés et assistants personnalisables.", href:"/dashboard/agents", status:"live" },
];
