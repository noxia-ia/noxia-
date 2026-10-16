# Dashboard Admin Zero-Knowledge — Analytics, NSFW, Marketing

## Principes Zero-Knowledge

1. **Aucun message / prompt / mémoire** n'est sélectionné par les RPC admin.
2. Seuls des **agrégats** (COUNT, SUM, ratios) sont retournés.
3. Les tables de chat (`agent_messages`, etc.) ne sont **pas jointes** dans les analytics.
4. Le contenu NSFW est géré par **paramètres globaux + âge + plan**, sans inspection des conversations.
5. Le compteur public d'inscrits est un `count(*)` anonyme exposé à `anon`.

## RPC Supabase (migration 0053)

| Fonction | Accès | Rôle |
|----------|--------|------|
| `public_signup_count()` | anon + auth | Compteur landing |
| `admin_analytics_overview()` | admin | KPIs macro |
| `admin_media_engine_usage(days)` | admin | Module × provider |
| `admin_signup_evolution(days)` | admin | Courbe inscriptions (existant 0043) |
| `admin_get_content_settings()` | admin | Flags NSFW |
| `admin_update_content_settings(...)` | admin | Update flags (âge obligatoire si NSFW) |
| `admin_nsfw_stats(days)` | admin | Blocages / âge (compteurs) |
| `admin_marketing_analytics(days)` | admin | CAC, CTR, CVR, ROI par source |
| `admin_upsert_marketing_source(...)` | admin | Sources trafic |
| `admin_add_marketing_spend(...)` | admin | Dépenses ads |
| `user_payment_eligibility()` | auth | Checkout : âge + NSFW sans lire les chats |

## Pages admin

- `/admin/analytics` — inscrits, plans, crédits, moteurs médias, évolution
- `/admin/nsfw` — paramètres contenus sensibles + stats sécurité
- `/admin/marketing` — ROI / CAC / conversions par source

## API publique

- `GET /api/public/signup-count` → `{ count: number }` (cache 5 min)

## Intégration nav admin

Dans `src/app/admin/layout.tsx`, ajouter :

```tsx
<Link href="/admin/nsfw" className="hover:text-white">NSFW</Link>
<Link href="/admin/marketing" className="hover:text-white">Marketing</Link>
```

## Attribution acquisition

Colonne optionnelle `profiles.acquisition_source` (code court).
À renseigner à l'inscription via query `?src=google_ads` (côté serveur register, jamais de PII).

## Checkout / âge

Avant d'autoriser un module NSFW ou un plan lié :

```ts
const { data } = await supabase.rpc("user_payment_eligibility");
// data.age_verified, data.can_access_nsfw, ...
```
