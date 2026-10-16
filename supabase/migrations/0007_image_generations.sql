-- DRACULA AI — étape 8 : module Image. À exécuter APRÈS 0006.
-- Seule modification nécessaire : generations.module n'autorisait pas 'image' (contrainte de 0001).
-- Les colonnes params, provider, provider_job_id, result, error_message, completed_at existent déjà (0003 et 0005).
-- Les droits (lecture seule pour l'utilisateur, écriture serveur) viennent de 0004 : rien à changer.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.generations'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%module%'
  loop
    execute format('alter table public.generations drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.generations add constraint generations_module_check check (module in ('code','asmr','video','agents','image'));
