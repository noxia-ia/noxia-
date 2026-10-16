-- NOXIA AI — 0048 : activation des tarifs d'abonnement par devise
-- Les tarifs de référence restent en FCFA. USD/EUR sont des prix explicites,
-- pas une conversion automatique au moment de l'affichage.
-- Ne modifie aucune migration précédente.

update public.plan_prices
set active = true,
    updated_at = now()
where (plan, currency, amount_minor) in (
  ('free',  'USD', 0),
  ('plus',  'USD', 499),
  ('pro',   'USD', 1199),
  ('ultra', 'USD', 2999),
  ('free',  'EUR', 0),
  ('plus',  'EUR', 499),
  ('pro',   'EUR', 1199),
  ('ultra', 'EUR', 2999)
);

-- Si une ligne attendue n'existe pas dans une base déjà existante, on la crée.
insert into public.plan_prices (plan, currency, amount_minor, is_reference, active)
values
  ('free',  'USD', 0,    false, true),
  ('plus',  'USD', 499,  false, true),
  ('pro',   'USD', 1199, false, true),
  ('ultra', 'USD', 2999, false, true),
  ('free',  'EUR', 0,    false, true),
  ('plus',  'EUR', 499,  false, true),
  ('pro',   'EUR', 1199, false, true),
  ('ultra', 'EUR', 2999, false, true)
on conflict (plan, currency) do update
set amount_minor = excluded.amount_minor,
    is_reference = excluded.is_reference,
    active = true,
    updated_at = now();

-- Le prix FCFA reste la référence comptable/fonctionnelle de chaque plan.
-- Les montants USD/EUR sont des tarifs explicites validés, affichés selon la devise
-- choisie par l'utilisateur.
