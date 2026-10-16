-- NOXIA — promouvoir UN compte en administrateur. À exécuter À LA MAIN dans Supabase → SQL Editor (rôle postgres). Ce n'est PAS une migration : ne l'ajoute jamais au dossier migrations.
-- Pourquoi à la main : le rôle « admin » est protégé. Le navigateur ne peut PAS modifier la colonne `role` (aucun droit d'écriture), et le formulaire d'inscription crée toujours un compte « user ».
-- Remplace VOTRE_EMAIL par l'e-mail EXACT de votre compte (celui avec lequel vous vous connectez).

-- 1) VÉRIFIER d'abord le compte (lecture seule) : doit renvoyer 1 ligne ; `role` vaut « user » avant la promotion.
select p.user_id, p.email, p.role, p.date_of_birth is not null as age_renseigne, u.email_confirmed_at is not null as email_confirme
from public.profiles p join auth.users u on u.id = p.user_id
where lower(p.email) = lower('VOTRE_EMAIL');

-- 2) PROMOUVOIR (une seule ligne modifiée ; ne touche ni crédits, ni abonnement, ni mot de passe).
update public.profiles set role = 'admin' where lower(email) = lower('VOTRE_EMAIL');

-- 3) VÉRIFIER après : `role` doit valoir « admin ».
select user_id, email, role from public.profiles where lower(email) = lower('VOTRE_EMAIL');

-- Lister tous les administrateurs actuels (à vérifier de temps en temps : seules des personnes de confiance doivent y figurer).
select user_id, email, role from public.profiles where role = 'admin' order by created_at;

-- Retirer les droits d'administrateur d'un compte (retour arrière) :
-- update public.profiles set role = 'user' where lower(email) = lower('VOTRE_EMAIL');
