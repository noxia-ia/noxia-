import type { ContentPolicyMode, ModerationResult, PolicyResult } from "./types";

// Politique de contenu CENTRALISÉE (serveur). Le mode vient d'une variable SERVEUR ; valeur inconnue → « strict ».
// « 15+ » ne signifie PAS « contenu sexuel explicite autorisé » : le contrôle d'âge et la politique de contenu sont distincts.
export function getContentPolicyMode(): ContentPolicyMode {
  return process.env.CONTENT_POLICY_MODE === "strict" ? "strict" : "strict"; // seul mode existant ; à étendre côté serveur uniquement
}
export const MODERATION_BLOCKED_MESSAGE = "Cette demande ne peut pas être traitée car elle ne respecte pas les règles de sécurité de NOXIA AI.";
export const MODERATION_COOLDOWN_MESSAGE = "Trop de demandes refusées récemment. Réessaie plus tard.";
export const moderationMessage = (r: ModerationResult) => (!r.allowed && r.reason === "repeated_attempts" ? MODERATION_COOLDOWN_MESSAGE : MODERATION_BLOCKED_MESSAGE);

const base = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
const leet = (s: string) => s.replace(/@/g, "a").replace(/\$/g, "s").replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t");
const squash = (s: string) => leet(s).replace(/[^a-z]/g, ""); // détecte « p.e.d.o » ou « l o l i c o n »

// Règles extensibles : ajouter des motifs ici, sans toucher aux modules.
const ALWAYS_BLOCK = /\b(csam|child ?porn\w*|kid ?porn\w*|pedo|pedos|pedophil\w*|lolicon|shotacon|nudify|undress(?:ing)? ai|deshabill\w+ (?:cette|la|sa|ma) photo)\b/;
const ALWAYS_BLOCK_SQUASHED = /(lolicon|shotacon|pedophil|childporn|kidporn|nudify)/;
const MINOR = /\b(enfants?|mineur(?:e|es|s)?|ados?|adolescent(?:e|es|s)?|lyceen(?:ne|nes|s)?|collegien(?:ne|nes|s)?|ecolier(?:e|es|s)?|gamin(?:e|es|s)?|gosses?|fillettes?|garconnets?|bebes?|nourrissons?|preados?|pre-ados?|preteens?|teen(?:s|ager|agers|age)?|child(?:ren)?|kids?|minors?|under-?age|underaged|schoolgirls?|schoolboys?|lolis?|shotas?|petites? filles?|petits? garcons?|young (?:girl|boy|teen)s?|little (?:girl|boy)s?|high ?school(?:er)?s?)\b/;
const YOUTH_AMBIGUOUS = /\b(jeunes?|young|petite?s?|innocent(?:e|es|s)?|ecole|scolaire|school|uniforme?s?|girls?|boys?|filles?|garcons?|lolita|barely legal|tout juste majeure?|juste majeure?)\b/;
const SEXUAL = /\b(sex(?:e|es|ys?|ual|uel|uelle|uels|uelles)?|erotiques?|erotic|porn(?:o|ographique|ographic|ography)?|xxx|nsfw|nu|nue|nus|nues|nudite|nudity|nudes?|naked|topless|fetich\w*|fetish|lingerie|sous-vetements?|underwear|seduct\w*|sensuel(?:le|les|s)?|sensual|explicit(?:e|es|s)?|orgasm\w*|masturb\w*|fellation|penetration|genital\w*|vagin\w*|penis|boobs)\b/;
const REAL_PERSON = /\b(deepfakes?|face ?swap|echange\w* (?:le |son )?visage|visage de|le visage d[eu]|photos? (?:de|d'|of|reelle?)|ma photo|cette photo|this photo|my photo|uploaded (?:photo|image)|vraie? personne|real person|personne reelle|mon (?:ex|voisin|collegue|prof|professeur|patron|cousin|frere|pere)|ma (?:ex|voisine|collegue|prof|cousine|soeur|mere|patronne|copine|femme)|celebrit(?:e|es|y|ies)|actrices?|actress(?:es)?|acteurs?|chanteuses?|singers?|influenceu(?:se|r|rs|ses)|influencers?|politicien(?:ne)?s?|politicians?|presidente?s?|my (?:ex|neighbou?r|coworker|colleague|teacher|boss|cousin|sister|mother|girlfriend|wife)|ex-?(?:copine|girlfriend|boyfriend))\b/;
const BYPASS = /\b(ignor\w* (?:toutes? )?(?:les |tes |vos |all |the |previous |your )?(?:regles|consignes|instructions|filtres?|rules|safety|securite)|contourn\w* (?:le |les |la )?(?:filtres?|moderation|securite|regles)|bypass\w* (?:the )?(?:filters?|safety|moderation|rules)|desactiv\w* (?:le |la |les )?(?:filtres?|securite|moderation)|disable (?:the )?(?:safety|filters?|moderation)|jailbreak\w*|dan mode|do anything now|sans (?:aucune? )?(?:restrictions?|censure|filtres?)|no (?:restrictions|censorship|filters?)|uncensored|mode developpeur|developer mode|pretend you have no (?:rules|limits)|fais comme si tu n'avais pas de regles)\b/;

function minorAge(text: string): boolean {
  for (const m of text.matchAll(/\b(\d{1,2})\s*-?\s*(?:ans?|yo|y\/o|y\.o\.?|years?[ -]?old|anos)\b/g)) if (Number(m[1]) < 18) return true;
  for (const m of text.matchAll(/\b(?:age|aged|agee?s?)\s*(?:de|of|:)?\s*(\d{1,2})\b/g)) if (Number(m[1]) < 18) return true;
  return false;
}
const hit = (re: RegExp, a: string, b: string) => re.test(a) || re.test(b);

// Évaluation synchrone (aucun accès réseau/base). En cas de doute lié à un mineur : BLOQUER.
export function evaluatePolicy(text: string, _mode: ContentPolicyMode = "strict"): PolicyResult {
  const a = base(text), b = leet(a);
  if (ALWAYS_BLOCK.test(a) || ALWAYS_BLOCK_SQUASHED.test(squash(a))) return { allowed: false, reason: "minor_sexual", internal: "always_block_term" };
  const sexual = hit(SEXUAL, a, b);
  if (sexual && (hit(MINOR, a, b) || minorAge(a))) return { allowed: false, reason: "minor_sexual", internal: "minor_plus_sexual" };
  if (sexual && hit(YOUTH_AMBIGUOUS, a, b)) return { allowed: false, reason: "minor_sexual", internal: "ambiguous_age_plus_sexual" };
  if (sexual && hit(REAL_PERSON, a, b)) return { allowed: false, reason: "real_person_sexual", internal: "real_person_plus_sexual" };
  if (hit(BYPASS, a, b)) return { allowed: false, reason: "filter_bypass", internal: "bypass_attempt" };
  return { allowed: true };
}
