// Reconnaît, dans un message du chat, une DEMANDE DE CRÉATION D'IMAGE (« fais-moi une image de … », « dessine … », « génère une illustration de … »).
// Fichier PUR (aucun import de valeur) : testable sans serveur. Les questions sur les images (« comment générer une image ? », « décris cette image ») ne déclenchent rien.
import type { ImageRatio, ImageStyle } from "@/lib/ai/image/types";
export interface ChatImageIntent { prompt: string; style: ImageStyle; ratio: ImageRatio }

const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’`]/g, "'");
const VERB = "(?:fais|fait|faire|genere|generer|cree|creer|dessine|dessiner|produis|realise|montre|donne|prepare|imagine|make|generate|create|draw|paint|show|render|design)";
const NOUN = "(?:image|images|illustration|illustrations|dessin|dessins|photo|photos|portrait|picture|pictures|wallpaper|fond d'ecran|affiche|logo|visuel|artwork|fan ?art|avatar|poster|miniature|thumbnail)";
const POLITE = "(?:(?:s'il (?:te|vous) plait|stp|svp|please)[ ,]*)?(?:(?:peux|pourrais|pouvez|pourriez)[- ](?:tu|vous)[ ,]*|tu peux |vous pouvez |can you |could you |je veux |je voudrais |j'aimerais |i want |i'd like |i would like )?";
const DIRECT = new RegExp(`^\\s*${POLITE}${VERB}(?:[- ]moi| me)?\\s+(?:[^.!?\\n]{0,40}?\\b)?${NOUN}\\b`);
// « dessine-moi un dragon » : ces verbes signifient déjà « créer une image », même sans le mot « image ».
const DRAW = new RegExp(`^\\s*${POLITE}(?:me |moi )?(?:dessine|dessiner|draw|paint|peins|peindre)(?:[- ]moi| me)?\\s+\\S{2,}`);
const NOUN_FIRST = new RegExp(`^\\s*${POLITE}${NOUN}\\s+(?:de |d'|du |des |of |with |avec )`);
const NOT_A_REQUEST = /\b(comment|pourquoi|explique|expliquer|how to|how do|how can|decris|decrire|analyse|analyser|que voit|what is in|code|script|api|prompt pour|exemple de prompt)\b/;

const STYLE_RULES: [RegExp, ImageStyle][] = [
  [/\b(anime|manga|chibi|ghibli|shonen|kawaii|boruto|naruto|sasuke|goku|luffy|one piece|dragon ball|demon slayer)\b/, "anime"],
  [/\b(3d|pixar|render 3d|rendu 3d)\b/, "3d"],
  [/\b(peinture|huile|aquarelle|painting|watercolor)\b/, "painting"],
  [/\b(cinema|cinematique|cinematic|film)\b/, "cinematic"],
  [/\b(dark fantasy|gothique|sombre)\b/, "dark_fantasy"],
  [/\b(minimaliste|minimalist|epure|flat)\b/, "minimalist"],
  [/\b(realiste|photoreal|photo|photographie|portrait)\b/, "realistic"],
];
const RATIO_RULES: [RegExp, ImageRatio][] = [
  [/\b(16[:/]9|paysage|landscape|wallpaper|fond d'ecran pc|banniere|banner|youtube)\b/, "16:9"],
  [/\b(9[:/]16|vertical|story|stories|tiktok|reel|fond d'ecran (?:telephone|mobile))\b/, "9:16"],
  [/\b(4[:/]5|instagram)\b/, "4:5"],
  [/\b(3[:/]4)\b/, "3:4"],
];

export function parseImageIntent(text: string): ChatImageIntent | null {
  const raw = String(text ?? "").trim();
  if (raw.length < 6 || raw.length > 1500) return null;
  const t = strip(raw);
  if (NOT_A_REQUEST.test(t)) return null;
  if (!DIRECT.test(t) && !NOUN_FIRST.test(t) && !DRAW.test(t)) return null;
  const style = STYLE_RULES.find(([re]) => re.test(t))?.[1] ?? "illustration";
  const ratio = RATIO_RULES.find(([re]) => re.test(t))?.[1] ?? "1:1";
  return { prompt: raw, style, ratio };
}
