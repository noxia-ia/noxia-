import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/0043_admin_signup_evolution.sql', 'utf8');
// La page analytics passe par fetchSignupEvolution (src/lib/admin/analytics.ts) ; l'ancienne page (audience) appelle la fonction directement.
const page = ['src/app/admin/analytics/page.tsx', 'src/app/admin/analytics/audience/page.tsx', 'src/lib/admin/analytics.ts'].map(p => fs.readFileSync(p, 'utf8')).join('\n');

for (const token of [
  'admin_signup_evolution',
  'public.is_admin()',
  'generate_series',
  'revoke all on function public.admin_signup_evolution',
]) if (!migration.includes(token)) throw new Error(`migration missing ${token}`);
if (!page.includes('admin_signup_evolution')) throw new Error('admin analytics page is not wired to signup evolution');
if (!page.includes('30 derniers jours')) throw new Error('signup evolution period missing');

console.log('admin-analytics-evolution: OK (server admin RPC + 30-day UI wiring)');
