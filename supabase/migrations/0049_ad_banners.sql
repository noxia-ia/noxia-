-- NOXIA : bande publicitaire gérée par l'administrateur.
-- À exécuter APRÈS 0048. Lecture : utilisateurs connectés (bandes actives et dans leurs dates). Écriture : admin uniquement (is_admin(), relu en base).
create table if not exists public.ad_banners (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Sponsorisé' check (char_length(btrim(label)) between 1 and 30),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 200),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500)),
  link_url text not null check (link_url ~ '^https://' and char_length(link_url) <= 500),
  cta_label text not null default 'Découvrir' check (char_length(btrim(cta_label)) between 1 and 30),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  hide_for_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists ad_banners_active_idx on public.ad_banners (active, sort_order);

drop trigger if exists ad_banners_updated_at on public.ad_banners;
create trigger ad_banners_updated_at before update on public.ad_banners
  for each row execute function public.set_updated_at();

alter table public.ad_banners enable row level security;
revoke all on public.ad_banners from anon, authenticated;
grant select, insert, update, delete on public.ad_banners to authenticated;

drop policy if exists "ad_banners_select_visible" on public.ad_banners;
create policy "ad_banners_select_visible" on public.ad_banners for select to authenticated
  using (public.is_admin() or (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())));

drop policy if exists "ad_banners_insert_admin" on public.ad_banners;
create policy "ad_banners_insert_admin" on public.ad_banners for insert to authenticated with check (public.is_admin());

drop policy if exists "ad_banners_update_admin" on public.ad_banners;
create policy "ad_banners_update_admin" on public.ad_banners for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ad_banners_delete_admin" on public.ad_banners;
create policy "ad_banners_delete_admin" on public.ad_banners for delete to authenticated using (public.is_admin());
