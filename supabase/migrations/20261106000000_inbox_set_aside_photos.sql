-- Listes de recettes à importer plus tard, sans analyse : « À planifier » (planning) et « De côté » (recettes).
-- Un élément est un lien, une idée, une recette enregistrée, ou 1 à 3 photos (pages de livre, captures d'écran)
-- gardées dans le stockage des photos en attendant d'être lues.

alter table public.planning_inbox
  add column list text not null default 'plan' check (list in ('plan', 'aside')),
  add column photos text[] not null default '{}' check (cardinality(photos) <= 3),
  -- Des photos : ni lien ni recette.
  add constraint planning_inbox_photos_alone check (cardinality(photos) = 0 or (url is null and recipe_id is null));

create index planning_inbox_list_idx on public.planning_inbox (list, created_at);

-- Ajoute un élément dans une liste. Un lien déjà enregistré comme recette devient un élément « recette ».
drop function public.add_to_inbox(text, text, uuid);
create function public.add_to_inbox(
  p_title text default null,
  p_url text default null,
  p_recipe_id uuid default null,
  p_list text default 'plan',
  p_photos text[] default '{}'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_title text := nullif(btrim(p_title), '');
  v_url text := nullif(btrim(p_url), '');
  v_recipe uuid := p_recipe_id;
  v_photos text[] := coalesce(p_photos, '{}');
  v_id uuid;
begin
  if p_list is null or p_list not in ('plan', 'aside') then
    raise exception 'Liste inconnue' using errcode = '22023';
  end if;
  if cardinality(v_photos) > 0 and (v_url is not null or v_recipe is not null) then
    raise exception 'Des photos ou un lien, pas les deux' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_photos) p where p !~ '^pending/[0-9a-f-]+\.(jpg|png|webp)$') then
    raise exception 'Photo invalide' using errcode = '22023';
  end if;
  if v_recipe is null and v_url is not null then
    select f.id into v_recipe from public.find_saved_recipe_by_url(v_url) f;
  end if;
  if v_recipe is not null then
    select r.title into v_title from public.recipes r where r.id = v_recipe and r.is_saved;
    if v_title is null then
      raise exception 'Recette sauvegardée introuvable' using errcode = 'P0002';
    end if;
    v_url := null;
  end if;
  if v_title is null then
    raise exception 'Titre requis' using errcode = '22023';
  end if;

  insert into public.planning_inbox (title, url, recipe_id, list, photos)
  values (left(v_title, 200), v_url, v_recipe, p_list, v_photos)
  returning id into v_id;
  return v_id;
end;
$$;

-- Planifie un élément : crée le repas et retire l'élément de la liste, en une seule transaction (version de
-- 20261030000000_hardening : un lien devenu entre-temps une recette sauvegardée planifie cette recette). En plus :
-- ses photos (pages d'un livre) deviennent celles de la recette du repas, rien n'est perdu et elles restent
-- lisibles en cuisinant.
create or replace function public.plan_inbox_item(p_item_id uuid, p_meal_date date, p_slot public.meal_slot, p_people uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_item public.planning_inbox;
  v_recipe uuid;
  v_meal uuid;
begin
  select * into v_item from public.planning_inbox where id = p_item_id for update;
  if not found then
    raise exception 'Élément introuvable' using errcode = 'P0002';
  end if;

  v_recipe := v_item.recipe_id;
  if v_recipe is null and v_item.url is not null then
    select f.id into v_recipe from public.find_saved_recipe_by_url(v_item.url) f limit 1;
  end if;

  v_meal := public.create_meal(
    p_meal_date,
    p_slot,
    p_people,
    p_recipe_id => v_recipe,
    p_adhoc_title => case when v_recipe is null then v_item.title end,
    p_adhoc_url => case when v_recipe is null then v_item.url end
  );
  insert into public.recipe_photos (recipe_id, storage_path, position)
  select m.recipe_id, p.path, p.position - 1
  from public.meals m, unnest(v_item.photos) with ordinality as p(path, position)
  where m.id = v_meal;
  delete from public.planning_inbox where id = p_item_id;
  return v_meal;
end;
$$;

-- Recette enregistrée depuis un élément (formulaire prérempli) : dans « À planifier », l'élément devient cette
-- recette ; dans « De côté », il disparaît. Renvoie les photos de l'élément, à retirer du stockage.
create function public.resolve_inbox_item(p_item_id uuid, p_recipe_id uuid)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  v_item public.planning_inbox;
  v_title text;
begin
  select * into v_item from public.planning_inbox where id = p_item_id for update;
  if not found then
    return '{}';
  end if;
  select r.title into v_title from public.recipes r where r.id = p_recipe_id and r.is_saved;
  if v_title is null then
    raise exception 'Recette sauvegardée introuvable' using errcode = 'P0002';
  end if;
  -- La recette est peut-être déjà dans la liste (ajoutée entre-temps) : l'élément est alors simplement retiré.
  if v_item.list = 'aside' or exists (select 1 from public.planning_inbox where recipe_id = p_recipe_id and id <> p_item_id) then
    delete from public.planning_inbox where id = p_item_id;
  else
    update public.planning_inbox
    set recipe_id = p_recipe_id, title = left(v_title, 200), url = null, photos = '{}'
    where id = p_item_id;
  end if;
  return v_item.photos;
end;
$$;

revoke execute on function public.add_to_inbox, public.plan_inbox_item, public.resolve_inbox_item from public, anon;
grant execute on function public.add_to_inbox, public.plan_inbox_item, public.resolve_inbox_item to authenticated;
