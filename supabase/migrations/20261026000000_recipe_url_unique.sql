-- Une même page de recette ne peut être sauvegardée qu'une fois.
-- Les recettes ponctuelles (planning) peuvent partager un lien.

-- Clé de comparaison : sans protocole, « www. », ancre ni « / » final, en minuscules.
create function public.recipe_url_key(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(regexp_replace(regexp_replace(btrim(p_url), '#.*$', ''), '/+$', ''), '^https?://(www\.)?', '', 'i')), '')
$$;

create unique index recipes_saved_url_unique on public.recipes (public.recipe_url_key(url))
  where is_saved and url is not null;

-- Recette sauvegardée qui utilise déjà ce lien (en ignorant p_exclude, la recette en cours de modification).
create function public.find_saved_recipe_by_url(p_url text, p_exclude uuid default null)
returns table (id uuid, title text)
language sql
stable
set search_path = ''
as $$
  select r.id, r.title
  from public.recipes r
  where r.is_saved
    and r.url is not null
    and public.recipe_url_key(r.url) = public.recipe_url_key(p_url)
    and r.id is distinct from p_exclude
  limit 1
$$;

-- Remplace une recette ponctuelle par une recette sauvegardée dans tous les repas qui l'utilisent ;
-- la recette ponctuelle, devenue inutile, est supprimée par le trigger de nettoyage.
create function public.use_saved_recipe(p_adhoc_id uuid, p_saved_id uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  if not exists (select 1 from public.recipes where id = p_saved_id and is_saved) then
    raise exception 'Recette sauvegardée introuvable' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.recipes where id = p_adhoc_id and not is_saved) then
    raise exception 'Recette ponctuelle introuvable' using errcode = 'P0002';
  end if;
  update public.meals set recipe_id = p_saved_id where recipe_id = p_adhoc_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.find_saved_recipe_by_url, public.use_saved_recipe from public, anon;
grant execute on function public.find_saved_recipe_by_url, public.use_saved_recipe to authenticated;
