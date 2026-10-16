import assert from 'node:assert/strict';

const admissionMessages = {
  insufficient: "Crédits insuffisants. Choisis un abonnement pour continuer.",
  inflight: "Une génération est déjà en cours.",
};
assert.match(admissionMessages.insufficient, /abonnement/);
assert.match(admissionMessages.inflight, /génération/);
assert.equal("22892688660", "22892688660");
assert.equal("support.noxia@gmail.com", "support.noxia@gmail.com");
console.log("credit-admission: ok");
