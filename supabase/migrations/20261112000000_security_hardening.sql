-- Durcissement : chaque écriture directe (API REST) respecte les mêmes règles que les fonctions de l'application.

-- 1. Réglages : la date du dernier rappel d'eau est réservée au serveur, à la création comme à la modification.
revoke insert on public.user_settings from authenticated;
grant insert (disabled_pages, muted_notifications, hydration_goal_ml, updated_at) on public.user_settings to authenticated;

-- 2. « À planifier » / « De côté » : seuls le titre et la liste se modifient directement (le reste passe par
--    add_to_inbox / plan_inbox_item / resolve_inbox_item) ; les photos sont forcément des fichiers pending/.
create function public.valid_pending_photos(p_photos text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(p ~ '^pending/[0-9a-f-]+\.(jpg|png|webp)$'), true) from unnest(p_photos) as p
$$;

revoke update on public.planning_inbox from authenticated;
grant update (title, list) on public.planning_inbox to authenticated;
alter table public.planning_inbox add constraint planning_inbox_photos_pending check (public.valid_pending_photos(photos));
-- resolve_inbox_item vide les photos de l'élément devenu recette : exécutée avec les droits du propriétaire
-- (réservée aux personnes connectées, comme avant ; la liste est partagée).
alter function public.resolve_inbox_item(uuid, uuid) security definer;

-- 3. Photos des recettes : un fichier du dossier de la recette, ou une photo temporaire pending/.
--    (Une photo d'une autre recette ne peut plus y être rattachée, puis supprimée du stockage avec elle.)
--    NOT VALID : contrôle des nouvelles écritures, sans bloquer la mise en prod sur une ligne ancienne.
alter table public.recipe_photos add constraint recipe_photos_path_owned check (
  storage_path ~ ('^' || recipe_id::text || '/[0-9a-f-]+\.(jpg|png|webp)$')
  or public.valid_pending_photos(array[storage_path])
) not valid;

-- 4. Tricot : un projet se crée seulement par create_knit_project (contrôle du dossier du PDF), et le PDF est
--    toujours dans le dossier de la propriétaire du projet.
revoke insert on public.knit_projects from authenticated;
alter table public.knit_projects add constraint knit_projects_pdf_owned check (pdf_path is null or split_part(pdf_path, '/', 1) = profile_id::text);
