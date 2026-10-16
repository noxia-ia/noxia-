# Abonnements et tarifs (migrations 0027 + 0048)

## Offres
Free · NOXIA PLUS · NOXIA PRO · NOXIA ULTRA (offres publiques). Les anciennes formules Daily / Weekly / Monthly / Annual sont **conservées** (abonnements existants, activation admin) mais ne sont plus proposées publiquement.
`subscriptions.plan` accepte : free, plus, pro, ultra, daily, weekly, monthly, annual.

## Prix — source de vérité : table `plan_prices`
- Montant entier en unités mineures + devise (XOF : 0 décimale ; USD/EUR : centimes). Aucun prix dans le code (`src/lib/plans.ts` n'en contient plus ; un test le vérifie).
- Devise de référence = **FCFA (XOF)**, une ligne `is_reference` par plan, toujours active.
- Tarifs officiels FCFA validés : Plus 2 500, Pro 6 000, Ultra 15 000, Free 0.
- USD : Plus 4,99 $ / Pro 11,99 $ / Ultra 29,99 $.
- EUR : Plus 4,99 € / Pro 11,99 € / Ultra 29,99 €.
- Ces montants sont des prix explicites par devise, pas une conversion automatique. La devise choisie par le client détermine le prix affiché. Le FCFA reste le prix de référence.
- Lecture : `anon` et connectés voient uniquement les prix actifs (RLS). Écriture : uniquement `admin_set_plan_price()` (admin, journalisé dans `plan_price_audit`). Règles : FCFA de référence toujours actif ; pas de prix USD/EUR actif sans prix FCFA ; Free = 0.
- Lecture côté app : `src/lib/pricing.ts` (`loadPriceBook`, `resolvePrice`, `priceLabel`).

## Pages
`/pricing` (publique) et `/dashboard/abonnements` lisent `plan_prices`. Plan sans prix de référence → « Prix à définir ».

## Ce que le code garantit réellement par plan
- Plus : 30 jours + 100 crédits.
- Pro : 30 jours + 300 crédits.
- Ultra : 30 jours + 1 000 crédits.
- Free : Daily Credits.
Les crédits sont consommés création par création : un abonnement actif ne rend jamais les générations illimitées. Si le solde tombe à zéro avant expiration, les générations payantes sont bloquées jusqu'à l'obtention de nouveaux crédits.

## Paiement
Aucun fournisseur de paiement n'est intégré. Activation **manuelle** via WhatsApp + `admin_update_subscription` (inchangé, avec niveaux). À connecter plus tard : créer une commande côté serveur, webhook signé du fournisseur, activation via la même fonction SQL, jamais depuis le navigateur.

## État Phase 1
Les prix XOF/USD/EUR sont affichables selon la devise du profil et restent modifiables par l'Admin avec audit. Il n'y a volontairement pas de conversion FX automatique : chaque devise possède son propre prix explicite. Le paiement en ligne automatisé reste hors de cette Phase 1.
