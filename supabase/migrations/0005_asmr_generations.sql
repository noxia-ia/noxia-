-- DRACULA AI — étape 5B : données ASMR dans generations. À exécuter APRÈS 0004.
-- Réutilise status, result, error_message, completed_at (migration 0003).
alter table public.generations
  add column if not exists params jsonb,
  add column if not exists provider text,
  add column if not exists provider_job_id text;
alter table public.generations add constraint generations_params_size check (params is null or pg_column_size(params) < 20000);
create index if not exists generations_user_module_idx on public.generations(user_id, module, created_at desc);
