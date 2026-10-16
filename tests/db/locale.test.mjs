import assert from "node:assert/strict";
import { COUNTRY_CODES, isCountryCode, countryOptions, countryName, normalizeLocale, normalizeCurrency, formatMoney, parsePreferences } from "../../src/lib/locale.ts";
import { getT, getMessages } from "../../src/lib/i18n/messages.ts";

assert.equal(COUNTRY_CODES.length, 249);
assert.equal(new Set(COUNTRY_CODES).size, 249);
assert.ok(isCountryCode("TG") && !isCountryCode("tg") && !isCountryCode("XX"));
assert.equal(countryOptions("fr")[0].value, "TG");
assert.equal(countryName("TG", "fr"), "Togo");
assert.equal(normalizeLocale("es"), "fr"); // langue pas encore activée -> défaut
assert.equal(normalizeLocale("en"), "en");
assert.equal(normalizeCurrency("GBP"), "XOF");
assert.equal(formatMoney({ amountMinor: 2500, currency: "XOF" }, "fr").replace(/\s| /g, ""), "2500FCFA");
assert.equal(formatMoney({ amountMinor: 499, currency: "USD" }, "en"), "$4.99");
const fd = o => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
assert.equal(parsePreferences(fd({}), true).ok, false, "pays obligatoire à l'inscription");
assert.equal(parsePreferences(fd({ country: "ZZ" }), true).ok, false);
assert.equal(parsePreferences(fd({ country: "tg", locale: "en", currency: "eur" }), true).value.country, "TG");
assert.equal(parsePreferences(fd({ country: "TG", locale: "es" }), true).ok, false, "langue non activée refusée");
assert.equal(parsePreferences(fd({ country: "TG", currency: "GBP" }), true).ok, false);
assert.equal(parsePreferences(fd({}), false).ok, true);
// dictionnaires : toute clé existe en fr et en
const fr = getMessages("fr"), en = getMessages("en");
for (const k of Object.keys(fr)) assert.ok(fr[k] && en[k] && fr[k] !== "" , k);
assert.notEqual(getT("en")("settings.title"), getT("fr")("settings.title"));
assert.equal(getT("de")("settings.title"), "Paramètres"); // repli sur le français
console.log("locale tests: ok");
