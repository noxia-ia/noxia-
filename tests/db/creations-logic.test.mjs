import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CREATION_TABS, parseTab, parseMediaUrl, toCreation, encodeCursor, parseCursor, fetchCreations, formatCreationDate, PAGE_SIZE } from "../../src/lib/creations.ts";

const U = n => `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const media = (kind, ext) => `/api/media/${kind}?path=${U(1)}%2F${U(2)}%2F${U(3)}.${ext}`;
const row = (o = {}) => ({ source: "generation", id: U(10), category: "image", title: "Un chat", status: "completed", created_at: "2026-10-05T10:00:00.123456+00:00", media_url: media("image", "png"), mime_type: "image/png", agent_id: null, agent_name: null, file_count: null, ...o });

// onglets
assert.deepEqual(CREATION_TABS.map(t => t.id), ["all", "conversation", "code", "image", "video", "audio", "music", "asmr", "series"]);
assert.equal(parseTab("image"), "image"); assert.equal(parseTab("../x"), "all"); assert.equal(parseTab(undefined), "all");

// URL de média : uniquement la route protégée de NOXIA
assert.equal(parseMediaUrl(media("video", "mp4")).kind, "video");
for (const bad of ["https://cdn.fal.media/x.png", "http://evil.test/a.png", "/api/media/image?path=../../etc/passwd", `/api/media/image?path=${U(1)}%2F${U(2)}%2F${U(3)}.svg`, "/api/media/other?path=x", "javascript:alert(1)", null, 42, `${media("image", "png")}&x=1`])
  assert.equal(parseMediaUrl(bad), null, String(bad));

// mise en forme
let c = toCreation(row());
assert.deepEqual([c.typeLabel, c.statusLabel, c.mediaKind, c.deletable], ["Image", "Terminé", "image", true]);
assert.equal(c.downloadUrl, `${media("image", "png")}&download=1`);
assert.equal(toCreation(row({ status: "processing" })).deletable, false, "pas de suppression d'un travail en cours");
assert.equal(toCreation(row({ status: "pending" })).deletable, false);
assert.equal(toCreation(row({ status: "failed", media_url: null })).deletable, true);
assert.equal(toCreation(row({ media_url: "https://cdn.fal.media/x.png" })).mediaUrl, null, "URL externe jamais affichée");
c = toCreation(row({ source: "conversation", category: "conversation", id: U(11), agent_id: U(12), agent_name: "Coach", title: "", media_url: null }));
assert.equal(c.openHref, `/dashboard/agents/${U(12)}?c=${U(11)}`); assert.equal(c.title, "Conversation"); assert.equal(c.deletable, true);
assert.equal(toCreation(row({ id: "not-a-uuid" })), null); assert.equal(toCreation(row({ category: "provider_x" })), null); assert.equal(toCreation(row({ source: "admin" })), null);
assert.equal(toCreation(row({ category: "code", media_url: null, file_count: 3 })).openHref, "/dashboard/code");
assert.equal(formatCreationDate("2026-10-05T23:59:00Z"), "05/10/2026");
for (const k of Object.keys(toCreation(row()))) assert.ok(!/provider|model/i.test(k), `champ exposé : ${k}`);

// curseur
const cur = encodeCursor({ createdAt: "2026-10-05T10:00:00.123456+00:00", id: U(10) });
assert.deepEqual(parseCursor(cur), { at: "2026-10-05T10:00:00.123456+00:00", id: U(10) });
for (const bad of ["", "x", `2026-10-05T10:00:00Z|'; drop table generations;--`, `2026-13-45T99:99:99Z|${U(1)}`, "a".repeat(200), null, 5]) assert.equal(parseCursor(bad), null, String(bad));

// pagination : fetchCreations (faux client) — aucun user_id transmis, ligne en plus = page suivante
const calls = [];
const mk = rows => ({ rpc: async (name, args) => { calls.push([name, args]); return { data: rows, error: null }; } });
const many = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => row({ id: U(100 + i), created_at: `2026-10-05T10:${String(59 - i).padStart(2, "0")}:00+00:00` }));
let p = await fetchCreations(mk(many), "image", null);
assert.equal(p.ok, true); assert.equal(p.items.length, PAGE_SIZE); assert.ok(p.nextCursor);
assert.deepEqual(Object.keys(calls[0][1]).sort(), ["p_before_at", "p_before_id", "p_category", "p_limit"].sort());
assert.equal(calls[0][0], "list_creations"); assert.equal(calls[0][1].p_limit, PAGE_SIZE);
p = await fetchCreations(mk(many.slice(0, 5)), "all", null); assert.equal(p.nextCursor, null);
p = await fetchCreations(mk(many), "all", p.nextCursor ?? cur); assert.equal(calls.at(-1)[1].p_before_id, U(10));
assert.equal((await fetchCreations(mk([]), "all", "bad-cursor")).ok, false);
assert.equal((await fetchCreations({ rpc: async () => ({ data: null, error: { code: "42501" } }) }, "all", null)).ok, false);
p = await fetchCreations(mk([row({ id: "bad" }), row()]), "all", null); assert.equal(p.items.length, 1, "ligne invalide ignorée");

// contrats de code (aucune exécution serveur possible ici : vérifications statiques)
const root = path.resolve(import.meta.dirname, "../..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const actions = read("src/app/dashboard/creations/actions.ts");
assert.ok(/auth\.getUser\(\)/.test(actions), "utilisateur issu de la session");
assert.ok(!/formData|FormData/.test(actions) && !/user_?id\s*:/i.test(actions.replace(/\.eq\("user_id", user\.id\)/g, "")), "aucun user_id reçu du navigateur");
assert.equal((actions.match(/\.eq\("user_id", user\.id\)/g) ?? []).length >= 3, true, "chaque lecture/suppression filtre sur l'utilisateur de la session");
assert.ok(actions.indexOf('from("generations").select') < actions.indexOf("await removeAssetsForGeneration"), "propriété vérifiée AVANT toute opération privilégiée");
assert.ok(/pending[\s\S]{0,40}processing/.test(actions), "génération en cours non supprimable");
assert.ok(actions.indexOf("await removeAssetsForGeneration") < actions.indexOf('from("generations").delete'), "fichiers supprimés avant la ligne");
assert.ok(/files\.failed > 0/.test(actions), "échec de suppression des fichiers : la génération est conservée");
for (const k of ["image", "video", "audio"]) {
  const r = read(`src/app/api/media/${k}/route.ts`);
  assert.ok(/getUser\(\)/.test(r) && /\.eq\("user_id", user\.id\)/.test(r), `${k}: session + propriétaire`);
  if (k === "video") {
    assert.ok(/createSignedUrl\(pathValue, 300\)/.test(r), `${k}: URL signée courte pour la lecture`);
    assert.ok(/filingram/.test(r) && /SUBSCRIPTION_REQUIRED/.test(r), `${k}: téléchargement vidéo soumis à la politique Filingram`);
  } else {
    assert.ok(/createSignedUrl\(path, 300, download \? \{ download: true \} : undefined\)/.test(r), `${k}: URL signée courte, téléchargement forcé sur demande`);
  }
  assert.ok(!/getPublicUrl/.test(r), `${k}: jamais d'URL publique`);
}
const mig = read("supabase/migrations/0028_creations_listing.sql");
const musicMig = read("supabase/migrations/0030_creations_music_listing.sql");
assert.ok(/auth\.uid\(\)/.test(mig) && !/security definer/i.test(mig.replace(/--.*$/gm, "")), "fonction SECURITY INVOKER (RLS appliquée) filtrée sur auth.uid()");
assert.ok(!/g\.provider|\bprovider_job_id|error_code/.test(mig.replace(/--.*$/gm, "")), "le fournisseur n'est jamais renvoyé");
assert.ok(/least\(coalesce\(p_limit, 24\), 60\)/.test(mig), "taille de page bornée");
assert.ok(musicMig.includes("'music'") && musicMig.includes('p_category in'), "catégorie music ajoutée par migration");

// aucun nom de fournisseur dans l'interface « Mes créations »
const ui = ["src/app/dashboard/creations/page.tsx", "src/app/dashboard/creations/actions.ts", "src/components/creations/CreationsBrowser.tsx", "src/lib/creations.ts"].map(read).join("\n");
assert.ok(!/elevenlabs|openai|anthropic|openrouter|fal\.ai|\bfal\b|runway|kling|\bwan\b|hugging ?face|replicate|stability/i.test(ui), "nom de fournisseur dans l'UI");
// navigation
const cfg = read("src/lib/config.ts");
assert.ok(/Mes créations", href:"\/dashboard\/creations"/.test(cfg));
assert.ok(!/Mes créations", href:"\/dashboard"/.test(cfg));
console.log("creations logic tests: ok");
