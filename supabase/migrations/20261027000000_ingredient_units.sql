-- Unités de mesure : liste fermée, et précision libre sur chaque ingrédient (« émincé », « bombée »…).
-- ⚠ La liste et UNIT_ALIASES sont aussi dans src/lib/units.ts (un test vérifie qu'elles sont identiques).

alter table public.recipe_ingredients add column note text check (note is null or char_length(note) <= 200);

-- Variante normalisée : sans accents, « (s) », points, espaces ni apostrophes, en minuscules.
create function public.unit_key(p_unit text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    replace(lower(translate(coalesce(p_unit, ''), 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc')), '(s)', ''),
    '[.[:space:]''’]', '', 'g')
$$;

-- Unité de la liste correspondant à une variante ('' = sans unité, null = inconnue).
create function public.normalize_unit(p_unit text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '{"g":"g","gr":"g","gramme":"g","grammes":"g","gram":"g","grams":"g","kg":"kg","kilo":"kg","kilos":"kg","kilogramme":"kg","kilogrammes":"kg","ml":"ml","millilitre":"ml","millilitres":"ml","cl":"cl","centilitre":"cl","centilitres":"cl","dl":"dl","decilitre":"dl","decilitres":"dl","l":"l","litre":"l","litres":"l","liter":"l","liters":"l","cac":"c. à c.","cc":"c. à c.","cuillereacafe":"c. à c.","cuilleresacafe":"c. à c.","cuilacafe":"c. à c.","cuillacafe":"c. à c.","petitecuillere":"c. à c.","tsp":"c. à c.","teaspoon":"c. à c.","teaspoons":"c. à c.","cas":"c. à s.","cs":"c. à s.","cuillereasoupe":"c. à s.","cuilleresasoupe":"c. à s.","cuilasoupe":"c. à s.","cuillasoupe":"c. à s.","grandecuillere":"c. à s.","tbsp":"c. à s.","tablespoon":"c. à s.","tablespoons":"c. à s.","pincee":"pincée","pincees":"pincée","pinch":"pincée","gousse":"gousse","gousses":"gousse","clove":"gousse","cloves":"gousse","tranche":"tranche","tranches":"tranche","slice":"tranche","slices":"tranche","sachet":"sachet","sachets":"sachet","boite":"boîte","boites":"boîte","can":"boîte","cans":"boîte","botte":"botte","bottes":"botte","bunch":"botte","brin":"brin","brins":"brin","sprig":"brin","sprigs":"brin","feuille":"feuille","feuilles":"feuille","leaf":"feuille","leaves":"feuille","verre":"verre","verres":"verre","glass":"verre","tasse":"tasse","tasses":"tasse","cup":"tasse","cups":"tasse","bol":"bol","bols":"bol","bowl":"bol","poignee":"poignée","poignees":"poignée","handful":"poignée","noix":"noix","filet":"filet","filets":"filet","trait":"filet","morceau":"morceau","morceaux":"morceau","piece":"","pieces":"","pc":"","pcs":"","unite":"","unites":""}'::jsonb ->> public.unit_key(p_unit)
$$;

-- Reconnaît l'unité en début ou en fin de texte : « c. à s. bombée(s) » → (c. à s., bombée(s)).
-- recognized = false : aucune unité reconnue.
create function public.split_unit(p_unit text, out recognized boolean, out unit text, out rest text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_words text[] := regexp_split_to_array(btrim(regexp_replace(coalesce(p_unit, ''), '\s+', ' ', 'g')), ' ');
  v_count int := coalesce(array_length(v_words, 1), 0);
  v_unit text;
begin
  recognized := true;
  if btrim(coalesce(p_unit, '')) = '' then
    return;
  end if;
  for i in reverse v_count..1 loop
    v_unit := public.normalize_unit(array_to_string(v_words[1:i], ' '));
    if v_unit is not null then
      unit := nullif(v_unit, '');
      rest := nullif(array_to_string(v_words[i + 1:v_count], ' '), '');
      return;
    end if;
  end loop;
  for i in 2..v_count loop
    v_unit := public.normalize_unit(array_to_string(v_words[i:v_count], ' '));
    if v_unit is not null then
      unit := nullif(v_unit, '');
      rest := array_to_string(v_words[1:i - 1], ' ');
      return;
    end if;
  end loop;
  recognized := false;
end;
$$;

-- Ingrédients existants : unité ramenée à la liste ; mots en plus, ou unité inconnue (avec sa quantité),
-- déplacés dans la précision.
update public.recipe_ingredients i
set unit = case when s.recognized then s.unit end,
    quantity = case when s.recognized then i.quantity end,
    note = case
      when s.recognized then s.rest
      else btrim(concat_ws(' ', trim_scale(i.quantity)::text, btrim(i.unit)))
    end
from public.recipe_ingredients src
cross join lateral public.split_unit(src.unit) s
where src.id = i.id and i.unit is not null;

alter table public.recipe_ingredients add constraint recipe_ingredients_unit_check
  check (unit is null or unit in ('g', 'kg', 'ml', 'cl', 'dl', 'l', 'c. à c.', 'c. à s.', 'pincée', 'gousse', 'tranche', 'sachet', 'boîte', 'botte', 'brin', 'feuille', 'verre', 'tasse', 'bol', 'poignée', 'noix', 'filet', 'morceau'));

-- Enregistrement : même règle pour l'unité, précision enregistrée.
create or replace function public.save_recipe(
  p_title text,
  p_ingredients jsonb,
  p_recipe_id uuid default null,
  p_notes text default null,
  p_url text default null,
  p_servings int default null,
  p_tags text[] default '{}'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_recipe_id;
begin
  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'Une recette sauvegardée doit avoir au moins un ingrédient' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.recipes (is_saved, title, notes, url, servings, tags)
    values (true, btrim(p_title), nullif(btrim(p_notes), ''), nullif(btrim(p_url), ''), p_servings, coalesce(p_tags, '{}'))
    returning id into v_id;
  else
    update public.recipes
    set is_saved = true,
        title = btrim(p_title),
        notes = nullif(btrim(p_notes), ''),
        url = nullif(btrim(p_url), ''),
        servings = p_servings,
        tags = coalesce(p_tags, '{}')
    where id = v_id;
    if not found then
      raise exception 'Recette introuvable' using errcode = 'P0002';
    end if;
    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients (recipe_id, position, name, quantity, unit, note)
  select
    v_id,
    (e.ord - 1)::int,
    btrim(e.value ->> 'name'),
    case when s.recognized then x.quantity end,
    case when s.recognized then s.unit end,
    nullif(concat_ws(', ',
      case when s.recognized then s.rest else btrim(concat_ws(' ', trim_scale(x.quantity)::text, x.unit)) end,
      x.note), '')
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
