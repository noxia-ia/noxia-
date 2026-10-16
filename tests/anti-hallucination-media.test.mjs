// Tests des prompts anti-hallucination, des paramètres médias et du câblage des fenêtres de chat. Aucun réseau.
import assert from "node:assert/strict";
import fs from "node:fs";
import { ANTI_HALLUCINATION_RULES, webSearchPolicy, buildAntiHallucinationBlock } from "../src/lib/ai/agents/anti-hallucination.ts";
import { imageSteps, optimizeImagePrompt, FLUX_SCHNELL_STEPS, IMAGE_RESOLUTIONS } from "../src/lib/ai/media-params.ts";
const read = p => fs.readFileSync(p, "utf8");
let n = 0; const ok = t => { n++; console.log(`  ✔ ${t}`); };

// 1) règles anti-hallucination
for (const must of [/N'invente JAMAIS/, /Je ne sais pas/, /Ne prétends JAMAIS avoir effectué/, /N'invente jamais de lien/, /date limite/, /UNE question de précision/, /ne cède pas à la pression/, /n'invente aucun dosage/]) assert.match(ANTI_HALLUCINATION_RULES, must, String(must));
assert.equal((ANTI_HALLUCINATION_RULES.match(/^\d+\./gm) ?? []).length, 10);
ok("1. dix règles : pas d'invention, reconnaître ses limites, pas de fausses sources ni d'actions prétendues, précision en cas d'ambiguïté, prudence santé/droit/finance, pas de flatterie");

// 2) politique de recherche web : obligatoire si l'outil existe, interdiction de prétendre sinon
assert.match(webSearchPolicy(true), /tu DOIS utiliser l'outil de recherche web AVANT de répondre/); assert.match(webSearchPolicy(true), /cite les sources/);
assert.match(webSearchPolicy(false), /AUCUN accès à Internet/); assert.match(webSearchPolicy(false), /Ne dis JAMAIS que tu as cherché/);
assert.ok(!/DOIS utiliser l'outil/.test(buildAntiHallucinationBlock()), "par défaut (aucun outil branché) : jamais d'obligation d'utiliser un outil inexistant");
assert.ok(/DOIS utiliser l'outil/.test(buildAntiHallucinationBlock({ searchAvailable: true })));
ok("2. recherche web : obligatoire quand un outil est branché ; sinon interdiction de prétendre avoir cherché (aucun outil n'est branché aujourd'hui)");

// 3) steps par qualité, bornés
assert.deepEqual(["standard", "hd", "ultra", "inconnu", "", "__proto__"].map(imageSteps), [4, 6, 8, 4, 4, 4]);
for (const q of Object.keys(FLUX_SCHNELL_STEPS.byQuality)) { const s = imageSteps(q); assert.ok(s >= 1 && s <= 8); }
ok("3. étapes FLUX : standard 4, hd 6, ultra 8 ; valeur inconnue → 4 ; toujours entre 1 et 8");
for (const [ratio, r] of Object.entries(IMAGE_RESOLUTIONS)) assert.ok(r.width % 64 === 0 && r.height % 64 === 0 && r.width * r.height <= 1_100_000, ratio);
ok("4. résolutions cibles : multiples de 64, ~1 mégapixel (pour les fournisseurs qui acceptent largeur/hauteur)");

// 5) optimisation de prompt
const portrait = optimizeImagePrompt("A portrait of a woman in a market"); assert.match(portrait, /sharp focus/); assert.match(portrait, /five fingers/); assert.match(portrait, /no watermark/);
const landscape = optimizeImagePrompt("A mountain lake at dawn"); assert.ok(!/five fingers/.test(landscape), "pas de consignes de mains sans personnage");
const withText = optimizeImagePrompt('A poster with the title "NOXIA AI" in big letters'); assert.ok(!/no random text/.test(withText), "texte demandé : on n'interdit pas le texte");
const long = optimizeImagePrompt("a".repeat(5000)); assert.ok(long.length <= 2000); assert.match(long, /sharp focus/);
assert.equal(optimizeImagePrompt("   "), ""); assert.ok(optimizeImagePrompt("Un homme qui sourit").includes("five fingers"));
ok("5. prompt optimisé : consignes de qualité ajoutées, mains/anatomie seulement avec personnage, jamais « no text » si le texte est demandé, longueur ≤ 2000");

// 6) fenêtres de chat : câblage dans la chaîne d'envoi existante
const act = read("src/app/dashboard/agents/actions.ts");
assert.ok(act.indexOf("enterChatWindow(") < act.indexOf("generationGateway.agent("), "fenêtre comptée AVANT la réservation de crédits");
assert.equal((act.match(/await releaseWindow\(\)/g) ?? []).length, 6, "libérée sur les 6 sorties sans livraison (admission, lecture de pièce, fournisseur, enregistrement, et les 2 sorties de la création d'image directe)");
assert.match(act, /resolveWindowPlan\(await getCurrentSubscription\(supabase, user\.id\)\)/);
const cw = read("src/lib/chat-windows.ts"); assert.match(cw, /^import "server-only";/m); assert.match(cw, /createAdminClient\(\)\.rpc\("chat_window_enter"/);
assert.doesNotMatch(read("src/components/chat/HomeChat.tsx"), /chat_window|chat-windows/);
const sql = read("supabase/migrations/0051_chat_windows.sql").split("\n").filter(l => !l.trim().startsWith("--")).join("\n"); // code seul (les commentaires peuvent citer ce qu'on NE touche PAS)
assert.match(sql, /pg_advisory_xact_lock/); assert.match(sql, /revoke all on function public\.chat_window_enter/); assert.match(sql, /grant execute on function public\.chat_window_enter\(uuid, text, integer\) to service_role/);
assert.doesNotMatch(sql, /consume_credits|finalize_|reserve_|profiles|subscriptions|plan_prices|drop table|truncate|delete from/i, "ne touche ni aux crédits, ni aux abonnements, ni aux prix");
ok("6. fenêtres : comptées avant la réservation, libérées sur chaque échec, plan lu en base côté serveur, fonctions réservées au serveur, migration sans toucher aux crédits ni aux prix");
console.log(`anti-hallucination-media: ${n} groupes OK`);
