import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPriceBook, resolvePrice, priceLabel, referenceNote } from "../../src/lib/pricing.ts";
import { PLANS, OFFER_PLAN_IDS, PAID_PLAN_IDS, isPaidPlan, isLegacyPlan, formatDuration } from "../../src/lib/plans.ts";

const rows = [
  { plan: "plus", currency: "XOF", amount_minor: "2500", is_reference: true, active: true }, // bigint Postgres = chaîne possible
  { plan: "plus", currency: "USD", amount_minor: 499, active: true },
  { plan: "pro", currency: "XOF", amount_minor: 6000, active: true },
  { plan: "pro", currency: "USD", amount_minor: 1199, active: false }, // inactif -> ignoré
  { plan: "ultra", currency: "GBP", amount_minor: 1, active: true }, // devise inconnue -> ignorée
  { plan: "ultra", currency: "XOF", amount_minor: -5, active: true }, // montant invalide -> ignoré
  { plan: "free", currency: "XOF", amount_minor: 0, active: true },
];
const book = buildPriceBook(rows);
assert.deepEqual(book.plus.XOF, { amountMinor: 2500, currency: "XOF" });
assert.equal(book.pro.USD, undefined);
assert.equal(book.ultra, undefined);
assert.equal(buildPriceBook(null) && Object.keys(buildPriceBook(undefined)).length, 0);

let p = resolvePrice(book, "plus", "XOF");
assert.equal(priceLabel(p).replace(/\s| /g, ""), "2500FCFA"); assert.equal(referenceNote(p), null);
p = resolvePrice(book, "plus", "USD");
assert.equal(priceLabel(p, "en"), "$4.99");
assert.match(referenceNote(p, "fr"), /2.?500.?FCFA/);
assert.equal(p.reference.amountMinor, 2500, "la référence reste le FCFA");
p = resolvePrice(book, "pro", "USD"); // pas de prix USD actif -> repli FCFA, JAMAIS de conversion
assert.deepEqual([p.display.currency, p.display.amountMinor], ["XOF", 6000]);
p = resolvePrice(book, "pro", "EUR"); assert.equal(p.display.currency, "XOF");
assert.equal(resolvePrice(book, "ultra", "XOF"), null);
assert.equal(priceLabel(null), "Prix à définir");
assert.equal(priceLabel(resolvePrice(book, "free", "EUR")), "Gratuit");
assert.equal(resolvePrice(buildPriceBook([{ plan: "plus", currency: "USD", amount_minor: 499, active: true }]), "plus", "USD"), null, "sans prix FCFA de référence -> pas de prix");

// plans : offres publiques, anciennes formules conservées
assert.deepEqual([...OFFER_PLAN_IDS], ["free", "plus", "pro", "ultra"]);
for (const id of ["daily", "weekly", "monthly", "annual"]) { assert.ok(PLANS[id] && isLegacyPlan(id) && isPaidPlan(id)); }
for (const id of ["plus", "pro", "ultra"]) { assert.ok(isPaidPlan(id)); assert.equal(PLANS[id].durationDays, 30); assert.equal(formatDuration(PLANS[id]), "30 jours"); assert.ok([100,300,1000].includes(PLANS[id].credits)); }
assert.ok(!isPaidPlan("free"));
assert.equal(PAID_PLAN_IDS.length, 7);
for (const id of Object.keys(PLANS)) assert.ok(!("priceFcfa" in PLANS[id]), "aucun prix dans plans.ts");

// aucun prix codé en dur dans le frontend, aucun nom de fournisseur dans les fichiers UI de cette étape
const root = path.resolve(import.meta.dirname, "../../src");
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(root).filter(f => /\.(ts|tsx)$/.test(f));
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  assert.ok(!/\b(2[ \u202f\u00a0]?500|6[ \u202f\u00a0]?000|15[ \u202f\u00a0]?000)\s*FCFA/i.test(s), `prix codé en dur dans ${f}`);
  assert.ok(!/\b(4\.99|11\.99|29\.99)\b/.test(s), `prix USD/EUR codé en dur dans ${f}`);
}
const ui = ["app/pricing/page.tsx", "app/dashboard/abonnements/page.tsx", "components/subscription/PlanCard.tsx", "lib/plans.ts", "lib/pricing.ts"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
assert.ok(!/elevenlabs|openai|anthropic|openrouter|fal\.ai|runway|kling|hugging ?face/i.test(ui), "nom de fournisseur dans l'UI abonnements/pricing");
console.log("pricing logic tests: ok");
