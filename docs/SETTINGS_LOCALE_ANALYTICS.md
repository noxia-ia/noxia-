# Paramètres, pays, langue, devise, analytics (migration 0026)

## Paramètres — `/dashboard/settings`
- **Actif** : nom (colonne `full_name`, RLS/privilèges de 0001), pays / langue / devise (RPC `set_profile_preferences`), changement de mot de passe (Supabase Auth, session courante), résumé plan + crédits (lecture seule).
- **Visible mais « Bientôt disponible »** (aucun backend) : thème, notifications, voix NOXIA (voix, vitesse, lecture automatique), personnalisation NOXIA (style de réponse, mémoire).
- **Non implémenté** : suppression de compte (nécessite client admin + purge storage/données ; à faire avec validation explicite). Photo/avatar : non supporté dans l'UI actuelle.

## Pays, langue, devise
- Colonnes `profiles.country_code` (ISO 3166-1, NULL pour les comptes existants), `locale` (défaut `fr`), `display_currency` (`XOF|USD|EUR`).
- Inscription : pays **obligatoire** (validé serveur), langue et devise optionnelles ; le trigger `handle_new_user()` conserve la logique de 0017 (5 crédits + contrôle d'âge) et ignore les valeurs invalides.
- Écriture client directe interdite sur ces colonnes : seule la fonction `set_profile_preferences` les modifie. Le pays est **déclaré** (aucune géolocalisation) et modifiable librement ; règle à durcir si besoin (ex. limite de changements).
- Source de vérité front : `src/lib/locale.ts` (langues, devises, pays via `Intl.DisplayNames`). Langues actives : fr, en. Pour en activer une : `enabled: true` + dictionnaire dans `src/lib/i18n/messages.ts`.
- `src/lib/i18n/messages.ts` : seule la page Paramètres est traduite ; le reste de l'interface reste en français (migration progressive).
- **Pas encore fait** : transmission de la langue au moteur conversationnel (les agents ont leur propre champ `language`) ; voix multilingue.

## Devises et prix
- `Money = { amountMinor, currency }` (entier en unités mineures). `formatMoney()` affiche un montant **dans sa devise**, sans conversion.
- Table `plan_prices` créée **vide** (aucun prix inventé) : un prix explicite par plan et par devise, une devise de référence par plan (`is_reference`). Aucune table de taux : tant qu'aucune source fiable n'existe, aucune conversion n'est faite. `PLANS[*].priceFcfa` reste inchangé (`null`) ; le branchement de `/dashboard/abonnements` sur `plan_prices` est l'étape Abonnements.
- Écriture de `plan_prices` : réservée au serveur (interface Admin à venir).

## Analytics (socle)
- `admin_audience_breakdown('country'|'locale'|'currency')` : admin uniquement, résultats agrégés (valeur, nombre, %), aucune donnée individuelle. Page `/admin/analytics` : non construite.

## Modules (rappel d'architecture)
Voice (parole NOXIA), Music (génération musicale, à connecter), Video ASMR (vidéo, à construire), Audio actuel = ASMR audio existant. Mini-Series : fondations non créées. Aucun de ces modules n'est présenté comme fonctionnel s'il ne l'est pas.

## Confidentialité
Pays = donnée de profil déclarée. Aucune collecte GPS. Statistiques détaillées : Admin seulement ; les annonceurs ne recevront que des agrégats choisis par l'Admin.
