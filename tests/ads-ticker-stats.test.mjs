import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// 1) Bande d'annonces qui DÉFILE : piste animée en boucle, pause au survol/clavier, repli « moins de mouvement ».
const ban = read("src/components/ads/AdBanner.tsx");
assert.match(ban, /nx-ad-track/); assert.match(ban, /animationDuration/); assert.match(ban, /aria-hidden=\{c > 0 \? true : undefined\}/);
const css = read("src/styles/globals.css");
assert.match(css, /@keyframes nx-ad-scroll\{from\{transform:translateX\(0\)\}to\{transform:translateX\(calc\(-100% \/ var\(--reps,2\)\)\)\}\}/);
assert.match(css, /\.nx-ad-ticker:hover \.nx-ad-track[^{]*\{animation-play-state:paused\}/);
assert.match(css, /prefers-reduced-motion:reduce\)\{\.nx-ad-track\{animation:none\}/);

// 2) Suivi affichages / clics : écrit par le serveur seulement, lu par l'admin seulement.
const sql = read("supabase/migrations/0056_banner_stats.sql");
assert.match(sql, /alter table public\.banner_events enable row level security/);
assert.match(sql, /revoke all on public\.banner_events from anon, authenticated/);
assert.match(sql, /grant execute on function public\.track_banner_event\(uuid, uuid, text\) to service_role/);
assert.doesNotMatch(sql, /grant execute on function public\.track_banner_event[^;]*authenticated/);
assert.match(sql, /if not public\.is_admin\(\) then raise exception 'forbidden'/);
assert.match(sql, /grant execute on function public\.admin_banner_stats\(integer\) to authenticated/);
assert.match(sql, /interval '30 minutes' else interval '10 seconds'/);
const route = read("src/app/api/banners/track/route.ts");
assert.match(route, /status: 401/); assert.match(route, /UUID_RE\.test\(body\.id\)/); assert.match(route, /track_banner_event/);
assert.match(ban, /track\(b\.id, "click"\)/); assert.match(ban, /track\(b\.id, "impression"\)|track\(b\.id, kind\)|fresh\.forEach\(b => track\(b\.id, "impression"\)\)/);

// 3) Statistiques visibles uniquement dans des pages admin ; campagnes ET bande rattachées à la page Analytics principale.
assert.match(read("src/app/admin/analytics/page.tsx"), /<AdsStats supabase=\{supabase\} \/>/);
assert.match(read("src/app/admin/analytics/page.tsx"), /await requireAdmin\(\)/);
assert.match(read("src/app/admin/banners/page.tsx"), /<AdsStats supabase=\{supabase\} show="banners" \/>/);
const stats = read("src/components/admin/AdsStats.tsx");
assert.match(stats, /admin_campaign_analytics/); assert.match(stats, /admin_banner_stats/);
for (const f of ["src/components/admin/AdsStats.tsx"]) assert.doesNotMatch(read("src/app/dashboard/rewards/page.tsx"), /AdsStats/, `${f} jamais côté utilisateur`);
assert.doesNotMatch(read("src/app/dashboard/page.tsx"), /AdsStats|admin_banner_stats/);
// 4) Pubs récompensées pour tous les utilisateurs : 2 crédits, 5 pubs et 10 crédits par jour au maximum.
const pol = read("src/lib/reward-policy.ts");
assert.match(pol, /rewardCredits: 2/); assert.match(pol, /maxAdsPerDay: 5/); assert.match(pol, /maxCreditsPerDay: 10/);
console.log("ads-ticker-stats: OK");
