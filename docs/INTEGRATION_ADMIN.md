# Intégration — Admin ZK Dashboard + NSFW + Marketing

## 1. Migration SQL

Exécuter dans Supabase SQL Editor :

`supabase/migrations/0053_admin_zk_analytics_nsfw_marketing.sql`

## 2. Fichiers à copier

```
src/lib/admin/analytics.ts
src/lib/admin/nsfw.ts
src/lib/admin/marketing.ts
src/app/admin/analytics/page.tsx          # remplace l'existant
src/app/admin/nsfw/page.tsx
src/app/admin/nsfw/actions.ts
src/app/admin/nsfw/NsfwSettingsForm.tsx
src/app/admin/marketing/page.tsx
src/app/admin/marketing/actions.ts
src/app/admin/marketing/MarketingForms.tsx
src/app/api/public/signup-count/route.ts
src/components/landing/PublicSignupCounter.tsx
```

## 3. Navigation admin

Dans `src/app/admin/layout.tsx`, ajouter les liens :

```tsx
<Link href="/admin/nsfw" className="hover:text-white">NSFW</Link>
<Link href="/admin/marketing" className="hover:text-white">Marketing</Link>
```

## 4. Landing — compteur public

```tsx
import { PublicSignupCounter } from "@/components/landing/PublicSignupCounter";

// dans le Hero ou Footer :
<PublicSignupCounter />
```

## 5. Register — attribution source (optionnel)

Lors de la création du profil, si `?src=` est présent :

```ts
acquisition_source: String(searchParams.get("src") ?? "").slice(0, 40) || null
```

## 6. Checkout / modules NSFW

```ts
const { data } = await supabase.rpc("user_payment_eligibility");
if (!data?.can_access_nsfw) { /* bloquer module */ }
```

## 7. Zero-Knowledge — checklist

- [ ] Aucune page admin ne fait `select` sur `agent_messages.content` / `prompt` / `result`
- [ ] Les RPC admin sont `security definer` + `is_admin()`
- [ ] Le compteur public ne retourne qu'un entier
- [ ] NSFW activé ⇒ `nsfw_requires_age_verified` forcé à true (SQL)
