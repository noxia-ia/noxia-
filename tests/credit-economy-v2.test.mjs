import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PLANS, OFFER_PLAN_IDS } from "../src/lib/plans.ts";
import { daysUntil, formatExpiryDate } from "../src/lib/credit-expiry.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/0054_credit_economy_v2.sql");

// Packs : Starter 100 · Pro 250 · Max 750, valables 60 jours (identifiants de base inchangés).
assert.deepEqual([...OFFER_PLAN_IDS], ["free", "plus", "pro", "ultra"]);
assert.deepEqual([PLANS.plus.credits, PLANS.pro.credits, PLANS.ultra.credits], [100, 250, 750]);
assert.deepEqual([PLANS.plus.name, PLANS.pro.name, PLANS.ultra.name], ["NOXIA STARTER", "NOXIA PRO", "NOXIA MAX"]);
for (const id of ["plus", "pro", "ultra"]) assert.equal(PLANS[id].durationDays, 60);

// Migration : bienvenue 12, bonus filleul 5, bonus parrain 10, validité 60 jours, prix Starter 3000 (Pro 6000 et Max 15000 déjà en base : 0027).
assert.match(sql, /v_credits integer := 12;/);
assert.match(sql, /v_credits := v_credits \+ 5;/);
assert.match(sql, /referrer_bonus integer not null default 10/);
assert.match(sql, /interval '60 days'/);
assert.match(sql, /'plus', 'XOF', 3000/);
assert.match(read("supabase/migrations/0027_subscription_tiers_pricing.sql"), /\('pro',\s+'XOF',\s+6000/);
assert.match(read("supabase/migrations/0027_subscription_tiers_pricing.sql"), /\('ultra',\s+'XOF',\s+15000/);
// Le parrain n'est crédité qu'une fois, à la confirmation de l'e-mail du filleul, et le parrainage ne se lit pas en direct (noms masqués).
assert.match(sql, /where referee_id = p_referee and status = 'pending'/);
assert.match(sql, /after insert or update of email_confirmed_at on auth\.users/);
assert.match(sql, /revoke all on public\.referrals from anon, authenticated/);
// Expiration : déclencheur sur profiles.credits (aucune fonction de crédits existante modifiée) ; solde périmé jamais dépensable.
assert.match(sql, /before update of credits on public\.profiles/);
assert.match(sql, /raise exception 'insufficient_credits'/);
assert.doesNotMatch(sql, /create or replace function public\.(consume_credits|create_generation_atomic|finalize_generation|admin_adjust_credits)/);
// Numérotation : aucune migration en double.
const nums = readdirSync(new URL("../supabase/migrations", import.meta.url)).filter(f => /^\d{4}_/.test(f)).map(f => f.slice(0, 4));
assert.equal(new Set(nums).size, nums.length, "numéros de migration uniques");

// Câblage : inscription (code ?ref= → metadata « ref »), pages Parrainage et Crédits, quota de code.
assert.match(read("src/app/register/actions.ts"), /\.\.\.\(ref \? \{ ref \} : \{\}\)/);
assert.match(read("src/app/register/page.tsx"), /ref/);
assert.match(read("src/app/dashboard/parrainage/page.tsx"), /my_referral_summary/);
assert.match(read("src/app/dashboard/parrainage/page.tsx"), /\/register\?ref=/);
assert.match(read("src/components/referral/ReferralLink.tsx"), /clipboard/);
assert.match(read("src/app/dashboard/code/actions.ts"), /enterCodeQuota/);
assert.match(read("src/app/dashboard/overview/page.tsx"), /CreditExpiry/);

// Dates d'expiration.
assert.equal(daysUntil("2026-12-12T00:00:00Z", Date.parse("2026-12-10T12:00:00Z")), 2);
assert.equal(daysUntil("2026-01-01T00:00:00Z", Date.parse("2026-02-01T00:00:00Z")), 0);
assert.match(formatExpiryDate("2026-12-12T00:00:00Z"), /12/);
console.log("credit-economy-v2: OK");
