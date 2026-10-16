import assert from "node:assert/strict";
import {
  imageCreditCost, videoCreditCost, musicCreditCost, asmrCreditCost, ttsCreditCost, sttCreditCost,
  CODE_CREDIT_COST, AGENT_MESSAGE_CREDIT_COST, chatMessageCreditCost, isValidChatMessageCost, generationCreditCost, NOXIA_GENERATION_COSTS,
} from "../src/lib/generation-costs.ts";

// Barème officiel (stratégie tarifaire v2).
// Texte et code : 0 crédit (quotas à fenêtre glissante).
assert.equal(CODE_CREDIT_COST, 0);
assert.equal(AGENT_MESSAGE_CREDIT_COST, 0);
assert.equal(chatMessageCreditCost([]), 0, "message texte : 0 crédit");
assert.equal(generationCreditCost("code"), 0);
assert.equal(generationCreditCost("agents"), 0);
// Image : 4 crédits par génération.
assert.equal(imageCreditCost(1), 4);
assert.equal(imageCreditCost(3), 12);
assert.equal(generationCreditCost("image", { count: 1 }), 4);
// Audio ASMR et voix : 5 crédits par génération.
assert.equal(asmrCreditCost("audio"), 5);
assert.equal(ttsCreditCost("a"), 5);
assert.equal(ttsCreditCost("a".repeat(3000)), 5, "voix : prix fixe par génération");
assert.throws(() => ttsCreditCost("   "), /empty_tts_text/);
// Musique : 8 crédits par génération, quelle que soit la durée.
for (const d of [15, 30, 60, 120]) assert.equal(musicCreditCost(d), 8);
assert.equal(generationCreditCost("music", { durationSeconds: 60 }), 8);
// Vidéo : paliers 5 s = 15 · 10 s = 25 · 15 s = 32 · 30 s = 50 ; durée hors palier refusée.
assert.equal(videoCreditCost(5), 15);
assert.equal(videoCreditCost(10), 25);
assert.equal(videoCreditCost(15), 32);
assert.equal(videoCreditCost(30), 50);
for (const bad of [0, 1, 7, 20, 60, -5, 2.5, NaN]) assert.throws(() => videoCreditCost(bad), /invalid_video_duration/, `durée ${bad} refusée`);
assert.equal(asmrCreditCost("video", 10), 25, "ASMR vidéo : même barème que la vidéo");
assert.equal(generationCreditCost("video", { durationSeconds: 30 }), 50);
// Transcription : inchangée (1 crédit par tranche de 30 s).
assert.equal(sttCreditCost(30), 1);
assert.equal(sttCreditCost(31), 2);
// Pièces jointes du chat : 2 crédits (décision précédente), jamais cumulés avec le prix du message.
assert.equal(chatMessageCreditCost(["image"]), 2);
assert.equal(chatMessageCreditCost(["zip"]), 2);
assert.equal(chatMessageCreditCost(["pdf", "rar"]), 2);
assert.equal(chatMessageCreditCost(["image", "zip"]), 2, "jamais cumulé");
assert.equal(NOXIA_GENERATION_COSTS.attachments.imageEdit, 2);
assert.equal(isValidChatMessageCost(0) && isValidChatMessageCost(2), true);
for (const bad of [1, 3, -1, 99, 1.5, NaN]) assert.equal(isValidChatMessageCost(bad), false, `prix ${bad} refusé`);
console.log("credit-economics tests: ok");
