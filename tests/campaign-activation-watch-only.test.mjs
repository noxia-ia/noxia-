import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const act = read("src/app/admin/campaigns/actions.ts");
// Les pubs récompensées par visionnage (required_action « visit ») s'activent ; une action sociale sans vérificateur reste refusée.
assert.match(act, /select\("platform,required_action"\)/);
assert.match(act, /const watchOnly = \(row\.required_action \?\? "visit"\) === "visit"/);
assert.match(act, /if \(!watchOnly && !getVerificationRegistry\(\)\.isConfigured\(providerForPlatform\(row\.platform\)\)\)/);
assert.match(act, /Activation refusée : aucun vérificateur officiel/);
assert.match(act, /p_required_action: "visit"/); // toute campagne créée aujourd'hui est de type visionnage
// La récompense ne dépend d'aucun vérificateur social (visionnage validé par le serveur).
const svc = read("src/lib/campaigns/service.ts");
assert.doesNotMatch(svc.slice(svc.indexOf("export async function claimReward"), svc.indexOf("async function balanceOf")), /verifyAction|getVerificationRegistry/);
console.log("campaign-activation-watch-only: OK");
