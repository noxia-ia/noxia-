import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseImageIntent } from "../src/lib/chat-image-intent.ts";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// 1) « Fais-moi une image de Boruto » : reconnu, style anime, image directe.
const b = parseImageIntent("fais moi une image de boruto");
assert.ok(b); assert.equal(b.style, "anime"); assert.equal(b.ratio, "1:1");
for (const t of ["Fais-moi une image de Boruto", "Peux-tu me dessiner un dragon rouge ?", "génère une illustration d'une forêt la nuit", "Crée un logo pour mon café", "dessine moi un chat", "make me a picture of a mountain at sunset", "image de Naruto en format paysage", "S'il te plaît, fais une photo réaliste d'un lion"])
  assert.ok(parseImageIntent(t), `doit être reconnu : ${t}`);
assert.equal(parseImageIntent("Fais-moi un fond d'écran 16:9 de la ville").ratio, "16:9");
assert.equal(parseImageIntent("dessine une image pour tiktok").ratio, "9:16");
assert.equal(parseImageIntent("fais une photo réaliste d'un lion").style, "realistic");
// ... mais pas les questions ni les autres demandes.
for (const t of ["Comment générer une image avec toi ?", "Décris l'image que j'ai envoyée", "Explique-moi ce qu'est une illustration", "Fais-moi un résumé de ce texte", "Écris un script pour générer des images", "bonjour", "Quelle est la capitale du Togo ?"])
  assert.equal(parseImageIntent(t), null, `ne doit pas être reconnu : ${t}`);
// Câblage : l'action du chat crée l'image directement, libère la réservation en cas d'échec, et le chat affiche l'image (route privée uniquement).
const act = read("src/app/dashboard/agents/actions.ts");
assert.match(act, /parseImageIntent\(text\)/); assert.match(act, /generateChatImage\(/); assert.match(act, /releaseWindow\(\);\s*return err\(img\.message/);
assert.match(read("src/components/chat/MessageContent.tsx"), /\\\/api\\\/media\\\/image\\\?path=/);
assert.match(read("src/components/chat/HomeChat.tsx"), /<MessageContent text=\{m\.content\} \/>/);
assert.match(read("src/components/chat/HomeChat.tsx"), /stripChatImages\(/);

// 2) Voix : Deepgram Nova-3 (transcription) et Aura (synthèse) via Cloudflare.
const voice = read("src/lib/ai/providers/voice/cloudflare-voice.ts");
assert.match(voice, /deepgram\\\/nova-3/); assert.match(voice, /language=fr/); assert.match(voice, /alternatives\?\.\[0\]\?\.transcript/);
assert.match(read("src/app/api/voice/transcribe/route.ts"), /controller\.signal, file\.type/);
assert.match(voice, /CLOUDFLARE_MODEL_TTS/);

// 3) Bulle déplaçable : glisser, seuil de déplacement, mémorisation, clavier, bornes d'écran.
const bub = read("src/components/support/SupportBubble.tsx");
for (const k of ["onPointerDown", "onPointerMove", "onPointerUp", "setPointerCapture", "touchAction", "localStorage", "ArrowLeft", "DRAG_THRESHOLD", "suppressClick"]) assert.ok(bub.includes(k), `bulle : ${k}`);

// 4) Design : règles existantes passées en verre sombre (pas seulement des surcharges).
const css = read("src/styles/globals.css");
assert.match(css, /\.noxia-module-card\{[^}]*rgba\(255,255,255,\.03\)[^}]*backdrop-filter:blur\(12px\)/);
assert.match(css, /\.noxia-credit-card,\.noxia-bonus-card\{[^}]*border:1px solid rgba\(255,255,255,\.1\)/);
assert.match(css, /\.noxia-module-card:hover[^{]*\{border-color:rgba\(168,85,247,\.3\)/);
console.log("chat-image-voice-bubble: OK");
