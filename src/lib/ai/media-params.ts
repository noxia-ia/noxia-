// Paramètres de diffusion des moteurs médias et optimisation automatique des prompts. Module pur (testable seul).
// Limites honnêtes : ces réglages RÉDUISENT les défauts graphiques courants (mains, anatomie, texte déformé, bruit), ils ne les éliminent pas et ne garantissent
// aucun résultat. Un paramètre n'est envoyé qu'à un fournisseur qui l'accepte : FLUX schnell (Cloudflare) accepte `prompt` et `steps` seulement (ni largeur/hauteur,
// ni prompt négatif) → la « résolution » n'est pas réglable pour lui ; elle l'est pour les fournisseurs à largeur/hauteur (ex. Hugging Face).

// Étapes de diffusion FLUX schnell : 1 à 8 (4 par défaut). Plus d'étapes = image plus soignée mais plus de consommation du quota Cloudflare (le prix en crédits reste inchangé).
export const FLUX_SCHNELL_STEPS = { min: 1, max: 8, byQuality: { standard: 4, hd: 6, ultra: 8 } as const };
export type MediaQuality = keyof typeof FLUX_SCHNELL_STEPS.byQuality;
export function imageSteps(quality: string): number {
  const q = (Object.hasOwn(FLUX_SCHNELL_STEPS.byQuality, quality) ? quality : "standard") as MediaQuality; // hasOwn : « __proto__ » ou « toString » ne doivent jamais passer
  return Math.min(FLUX_SCHNELL_STEPS.max, Math.max(FLUX_SCHNELL_STEPS.min, FLUX_SCHNELL_STEPS.byQuality[q]));
}

// Résolutions cibles par ratio (multiples de 64, ~1 mégapixel) pour les fournisseurs qui acceptent largeur/hauteur. Non utilisées par FLUX schnell.
export const IMAGE_RESOLUTIONS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 }, "4:5": { width: 896, height: 1152 }, "3:4": { width: 896, height: 1152 },
  "16:9": { width: 1344, height: 768 }, "9:16": { width: 768, height: 1344 },
};

// Optimisation de prompt : consignes POSITIVES en anglais (les modèles d'image sont entraînés surtout sur des légendes anglaises ; FLUX n'a pas de prompt négatif).
// Si l'utilisateur demande explicitement du texte dans l'image, on n'ajoute PAS « no text » (cela contredirait sa demande).
const QUALITY_CUES = "sharp focus, coherent composition, natural proportions, clean edges, consistent lighting, high detail";
const PEOPLE_CUES = "anatomically correct, well-formed hands with five fingers, natural facial features, symmetrical eyes";
const NO_TEXT_CUES = "no watermark, no logo, no random text or lettering";
const PEOPLE_RE = /\b(person|people|man|woman|girl|boy|child|portrait|face|hand|hands|couple|family|crowd|character|personne|homme|femme|fille|gar[cç]on|enfant|visage|main|mains|famille|personnage)\b/i;
const WANTS_TEXT_RE = /\b(text|texte|title|titre|logo|slogan|caption|l[ée]gende|lettering|typography|typographie|words?|mots?|written|[ée]crit)\b|["«“][^"»”]{2,}["»”]/i;
export function optimizeImagePrompt(prompt: string, maxLength = 2000): string {
  const base = prompt.trim();
  if (!base) return base;
  const cues = [QUALITY_CUES, PEOPLE_RE.test(base) ? PEOPLE_CUES : "", WANTS_TEXT_RE.test(base) ? "" : NO_TEXT_CUES].filter(Boolean).join(", ");
  const room = Math.max(0, maxLength - cues.length - 2);
  return `${base.slice(0, room)}. ${cues}`.slice(0, maxLength);
}
