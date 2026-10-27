-- Détails des recettes : source (livre, page…), temps de préparation / repos / cuisson, sous-parties d'ingrédients
-- (« Pour le streusel »).

alter table public.recipes
  add column source text check (source is null or char_length(source) between 1 and 200),
  add column prep_minutes int check (prep_minutes is null or prep_minutes between 0 and 10080),
  add column rest_minutes int check (rest_minutes is null or rest_minutes between 0 and 10080),
  add column cook_minutes int check (cook_minutes is null or cook_minutes between 0 and 10080);

alter table public.recipe_ingredients
  add column section text check (section is null or char_length(section) between 1 and 80);

-- Nouveaux paramètres : l'ancienne version est remplacée (sinon les deux coexisteraient).
-- Compatibilité : une application pas encore mise à jour n'envoie ni source ni temps (paramètres null) ; ils sont
-- alors conservés. L'application à jour envoie '' (source) ou 0 (temps) pour les effacer.
drop function public.save_recipe(text, jsonb, uuid, text, text, int, text[]);

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
  p_cook_minutes int default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_recipe_id;
  -- Sous-parties actuelles, par position : gardées si l'application (ancienne version) n'en envoie pas.
  v_old_sections text[] := '{}';
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
    select coalesce(array_agg(section order by position), '{}') into v_old_sections
    from public.recipe_ingredients where recipe_id = v_id;
    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients (recipe_id, position, name, quantity, unit, note, section)
  select
    v_id,
    (e.ord - 1)::int,
    btrim(e.value ->> 'name'),
    case when s.recognized then x.quantity end,
    case when s.recognized then s.unit end,
    nullif(concat_ws(', ',
      case when s.recognized then s.rest else btrim(concat_ws(' ', trim_scale(x.quantity)::text, x.unit)) end,
      x.note), ''),
    case when e.value ? 'section' then nullif(btrim(e.value ->> 'section'), '') else v_old_sections[e.ord] end
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
