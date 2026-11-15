-- Portions par plat et origine des articles de courses.
--   - planning_inbox.portions : portions à cuisiner pour un plat « À planifier », indépendamment de la recette
--     (la liste de courses multiplie ou divise la recette) ; null = non précisé.
--   - meals.portions : portions cuisinées pour ce repas ; 0 = restes d'un repas précédent (rien à acheter) ; null =
--     autant que de convives (comportement d'avant).
--   - shopping_items.sources : lignes de recette d'où vient l'article (« Lasagnes : 200 g farine »).

alter table public.planning_inbox add column portions smallint check (portions is null or portions between 1 and 99);
alter table public.meals add column portions smallint check (portions is null or portions between 0 and 99);
alter table public.shopping_items add column sources text[] not null default '{}'
  check (cardinality(sources) <= 30 and char_length(array_to_string(sources, '')) <= 4000);
-- Droits par colonne sur planning_inbox (20261112000000_security_hardening) : les portions se règlent aussi.
grant update (portions) on public.planning_inbox to authenticated;

-- Version de 20261106000000_inbox_set_aside_photos : en plus, les portions de l'élément passent au repas.
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
  update public.meals set portions = v_item.portions where id = v_meal;
  insert into public.recipe_photos (recipe_id, storage_path, position)
  select m.recipe_id, p.path, p.position - 1
  from public.meals m, unnest(v_item.photos) with ordinality as p(path, position)
  where m.id = v_meal;
  delete from public.planning_inbox where id = p_item_id;
  return v_meal;
end;
$$;

-- Version de 20261129000000_week_plan : chaque entrée peut donner ses portions (le premier repas d'un plat, celles
-- à cuisiner ; ses restes, 0). Sans portions, celles de l'élément (premier repas) ou rien (restes).
create or replace function public.plan_week(p_meals jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_entry record;
  v_first jsonb := '{}';
  v_meal uuid;
  v_count integer := 0;
begin
  for v_entry in
    select * from jsonb_to_recordset(p_meals) as x(item_id uuid, meal_date date, slot public.meal_slot, people uuid[], cook_id uuid, portions smallint)
    order by meal_date, slot
  loop
    if v_first ? v_entry.item_id::text then
      v_meal := public.duplicate_meal((v_first ->> v_entry.item_id::text)::uuid, v_entry.meal_date, v_entry.slot);
      update public.meals set people = v_entry.people where id = v_meal;
    else
      v_meal := public.plan_inbox_item(v_entry.item_id, v_entry.meal_date, v_entry.slot, v_entry.people);
      v_first := v_first || jsonb_build_object(v_entry.item_id::text, v_meal);
    end if;
    update public.meals set cook_id = v_entry.cook_id, portions = coalesce(v_entry.portions, portions) where id = v_meal;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
