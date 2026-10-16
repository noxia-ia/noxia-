-- DRACULA AI — étape 13 : ajoute l'état « erreur temporaire » aux vérifications de santé des fournisseurs. À exécuter APRÈS 0010.
alter table public.provider_health_checks drop constraint if exists provider_health_checks_status_check;
alter table public.provider_health_checks add constraint provider_health_checks_status_check
  check (status in ('ok', 'configured', 'not_configured', 'disabled', 'error', 'temporary_error'));
