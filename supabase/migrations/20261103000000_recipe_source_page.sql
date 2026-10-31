-- Livre et page séparés : « Pâtisserie maison, p. 146 » devient source = « Pâtisserie maison » et
-- source_page = « 146 » (un champ chacun dans le formulaire ; l'import en série remplit la page de chaque image).
-- Valeurs nutritionnelles indiquées par la recette : calories, glucides, protéines, lipides, et ce à quoi elles
-- se rapportent (une portion, toute la recette, 100 g).

alter table public.recipes
  add column source_page text check (source_page is null or char_length(source_page) between 1 and 20),
  add column nutrition_per text check (nutrition_per in ('portion', 'recette', '100 g')),
  add column kcal int check (kcal between 0 and 20000),
  add column carbs_g numeric(6, 1) check (carbs_g between 0 and 5000),
  add column protein_g numeric(6, 1) check (protein_g between 0 and 5000),
  add column fat_g numeric(6, 1) check (fat_g between 0 and 5000);

-- « X, p. 146 », « X page 146 », « p. 146-147 » → {livre ou null, page} ; null si la source ne finit pas par une page.
create function public.split_source(p_source text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when m is null then null else array[nullif(btrim(m[1], ' ,;-–'), ''), m[2]] end
  from (select regexp_match(btrim(p_source), '^(.*?)\m(?:p\.|pp\.|pages?)\s*(\d+(?:\s*[-–]\s*\d+)?)$', 'i') as m) s
$$;

revoke execute on function public.split_source from public, anon;
grant execute on function public.split_source to authenticated;

-- Recettes existantes
update public.recipes r
set source = s.parts[1], source_page = s.parts[2]
from (select id, public.split_source(source) as parts from public.recipes where source is not null) s
where r.id = s.id and s.parts is not null;

-- save_recipe : nouveaux paramètres p_source_page ('' efface la page) et p_nutrition
-- ({ per, kcal, carbs, protein, fat } ; {} efface). Absents (ancienne version de l'application) : valeurs conservées.
drop function public.save_recipe(text, jsonb, uuid, text, text, int, text[], text, int, int, int);

create function public.save_recipe(
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
  p_cook_minutes int default null,
  p_source_page text default null,
  p_nutrition jsonb default null
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
  -- Livre et page : une ancienne version de l'application n'envoie pas la page, mais peut l'écrire dans la source.
  v_source text := p_source;
  v_page text := p_source_page;
  v_split text[];
  -- Valeurs nutritionnelles envoyées (null : ancienne version, rien ne change).
  v_kcal int := nullif(p_nutrition ->> 'kcal', '')::int;
  v_carbs numeric := nullif(p_nutrition ->> 'carbs', '')::numeric;
  v_protein numeric := nullif(p_nutrition ->> 'protein', '')::numeric;
  v_fat numeric := nullif(p_nutrition ->> 'fat', '')::numeric;
  v_per text := case
    when coalesce(v_kcal::numeric, v_carbs, v_protein, v_fat) is null then null
    else coalesce(nullif(p_nutrition ->> 'per', ''), 'portion')
  end;
begin
  if p_source_page is null and p_source is not null then
    v_split := public.split_source(p_source);
    if v_split is not null then
      v_source := coalesce(v_split[1], '');
      v_page := v_split[2];
    end if;
  end if;

  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'Une recette sauvegardée doit avoir au moins un ingrédient' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.recipes (is_saved, title, notes, url, servings, tags, source, source_page, prep_minutes, rest_minutes, cook_minutes,
                                nutrition_per, kcal, carbs_g, protein_g, fat_g)
    values (true, btrim(p_title), nullif(btrim(p_notes), ''), nullif(btrim(p_url), ''), p_servings, coalesce(p_tags, '{}'),
            nullif(btrim(v_source), ''), nullif(btrim(v_page), ''),
            nullif(p_prep_minutes, 0), nullif(p_rest_minutes, 0), nullif(p_cook_minutes, 0),
            v_per, v_kcal, v_carbs, v_protein, v_fat)
    returning id into v_id;
  else
    update public.recipes
    set is_saved = true,
        title = btrim(p_title),
        notes = nullif(btrim(p_notes), ''),
        url = nullif(btrim(p_url), ''),
        servings = p_servings,
        tags = coalesce(p_tags, '{}'),
        source = case when v_source is null then source else nullif(btrim(v_source), '') end,
        source_page = case when v_page is null then source_page else nullif(btrim(v_page), '') end,
        nutrition_per = case when p_nutrition is null then nutrition_per else v_per end,
        kcal = case when p_nutrition is null then kcal else v_kcal end,
        carbs_g = case when p_nutrition is null then carbs_g else v_carbs end,
        protein_g = case when p_nutrition is null then protein_g else v_protein end,
        fat_g = case when p_nutrition is null then fat_g else v_fat end,
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

revoke execute on function public.save_recipe from public, anon;
grant execute on function public.save_recipe to authenticated;
