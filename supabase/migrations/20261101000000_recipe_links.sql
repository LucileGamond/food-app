-- Recettes liées : un ingrédient (« pâte sucrée, voir p. 208 ») peut renvoyer à une autre recette sauvegardée.
-- Le lien va dans un seul sens : la recette principale référence la sous-recette.
--
-- Pas de clé étrangère : une deuxième relation entre recipe_ingredients et recipes rendrait ambiguës les requêtes
-- `recipes → recipe_ingredients` des versions de l'application déjà installées. L'intégrité est assurée par
-- save_recipe / link_recipe_ingredient (seule une recette sauvegardée, autre que la recette elle-même, est gardée)
-- et par un trigger qui refuse de supprimer une sous-recette utilisée par une autre recette.

alter table public.recipe_ingredients
  add column linked_recipe_id uuid check (linked_recipe_id is distinct from recipe_id);

create index recipe_ingredients_linked_idx on public.recipe_ingredients (linked_recipe_id) where linked_recipe_id is not null;

-- Une sous-recette utilisée par une autre recette ne peut pas être supprimée (comme une recette du planning).
create function public.prevent_linked_recipe_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.recipe_ingredients where linked_recipe_id = old.id and recipe_id <> old.id) then
    raise exception 'Recette utilisée par une autre recette' using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function public.prevent_linked_recipe_delete from public, anon, authenticated;

create trigger recipes_prevent_linked_delete
  before delete on public.recipes
  for each row execute function public.prevent_linked_recipe_delete();

-- Recette qu'un ingrédient de `p_recipe_id` peut lier : sauvegardée et différente ; sinon null.
create function public.linkable_recipe(p_recipe_id uuid, p_linked_recipe_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select r.id from public.recipes r
  where r.id = p_linked_recipe_id and r.is_saved and r.id is distinct from p_recipe_id
$$;

revoke execute on function public.linkable_recipe from public, anon;
grant execute on function public.linkable_recipe to authenticated;

-- save_recipe garde les liens : `linked_recipe_id` dans chaque ingrédient ('' retire le lien). Une version de
-- l'application qui ne l'envoie pas conserve les liens existants, rattachés au nom de l'ingrédient (qu'elle peut
-- avoir déplacé).
create or replace function public.save_recipe(
  p_title text,
  p_ingredients jsonb,
  p_recipe_id uuid default null,
  p_notes text default null,
  p_url text default null,
  p_servings int default null,
  p_tags text[] default '{}',
  p_source text default null,
  p_prep_minutes int default null,
  p_rest_minutes int default null,
  p_cook_minutes int default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_recipe_id;
  -- Sous-parties (par position) et liens (par nom) actuels : gardés si l'application (ancienne version) n'en
  -- envoie pas.
  v_old_sections text[] := '{}';
  v_old_names text[] := '{}';
  v_old_links uuid[] := '{}';
begin
  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'Une recette sauvegardée doit avoir au moins un ingrédient' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.recipes (is_saved, title, notes, url, servings, tags, source, prep_minutes, rest_minutes, cook_minutes)
    values (true, btrim(p_title), nullif(btrim(p_notes), ''), nullif(btrim(p_url), ''), p_servings, coalesce(p_tags, '{}'),
            nullif(btrim(p_source), ''), nullif(p_prep_minutes, 0), nullif(p_rest_minutes, 0), nullif(p_cook_minutes, 0))
    returning id into v_id;
  else
    update public.recipes
    set is_saved = true,
        title = btrim(p_title),
        notes = nullif(btrim(p_notes), ''),
        url = nullif(btrim(p_url), ''),
        servings = p_servings,
        tags = coalesce(p_tags, '{}'),
        source = case when p_source is null then source else nullif(btrim(p_source), '') end,
        prep_minutes = case when p_prep_minutes is null then prep_minutes else nullif(p_prep_minutes, 0) end,
        rest_minutes = case when p_rest_minutes is null then rest_minutes else nullif(p_rest_minutes, 0) end,
        cook_minutes = case when p_cook_minutes is null then cook_minutes else nullif(p_cook_minutes, 0) end
    where id = v_id;
    if not found then
      raise exception 'Recette introuvable' using errcode = 'P0002';
    end if;
    select coalesce(array_agg(section order by position), '{}'),
           coalesce(array_agg(lower(btrim(name)) order by position), '{}'),
           coalesce(array_agg(linked_recipe_id order by position), '{}')
    into v_old_sections, v_old_names, v_old_links
    from public.recipe_ingredients where recipe_id = v_id;
    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients (recipe_id, position, name, quantity, unit, note, section, linked_recipe_id)
  select
    v_id,
    (e.ord - 1)::int,
    btrim(e.value ->> 'name'),
    case when s.recognized then x.quantity end,
    case when s.recognized then s.unit end,
    nullif(concat_ws(', ',
      case when s.recognized then s.rest else btrim(concat_ws(' ', trim_scale(x.quantity)::text, x.unit)) end,
      x.note), ''),
    case when e.value ? 'section' then nullif(btrim(e.value ->> 'section'), '') else v_old_sections[e.ord] end,
    public.linkable_recipe(v_id, case
      when not e.value ? 'linked_recipe_id' then v_old_links[array_position(v_old_names, lower(btrim(e.value ->> 'name')))]
      when (e.value ->> 'linked_recipe_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (e.value ->> 'linked_recipe_id')::uuid
    end)
  from jsonb_array_elements(p_ingredients) with ordinality as e(value, ord)
  cross join lateral (
    select nullif(e.value ->> 'quantity', '')::numeric as quantity,
           nullif(btrim(e.value ->> 'unit'), '') as unit,
           nullif(btrim(e.value ->> 'note'), '') as note
  ) x
  cross join lateral public.split_unit(x.unit) s;

  return v_id;
end;
$$;

-- Lie (ou délie, avec null) un ingrédient à une sous-recette, sans réenregistrer toute la recette. L'ingrédient est
-- désigné par sa position et son nom : si la recette a été modifiée entre-temps, rien n'est lié au mauvais endroit.
create function public.link_recipe_ingredient(p_recipe_id uuid, p_position int, p_name text, p_linked_recipe_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_linked uuid := public.linkable_recipe(p_recipe_id, p_linked_recipe_id);
begin
  if p_linked_recipe_id is not null and v_linked is null then
    raise exception 'Recette liée introuvable' using errcode = 'P0002';
  end if;
  update public.recipe_ingredients set linked_recipe_id = v_linked
  where recipe_id = p_recipe_id and position = p_position and lower(btrim(name)) = lower(btrim(p_name));
  if not found then
    raise exception 'Ingrédient introuvable' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.link_recipe_ingredient from public, anon;
grant execute on function public.link_recipe_ingredient to authenticated;
