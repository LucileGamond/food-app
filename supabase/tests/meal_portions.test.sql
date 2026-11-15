begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.planning_inbox;
delete from public.meals;
delete from public.recipes;
delete from public.shopping_lists;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Portions d'un plat « À planifier »
select public.add_to_inbox('Lasagnes');
select public.add_to_inbox('Soupe');
select lives_ok($$update public.planning_inbox set portions = 6 where title = 'Lasagnes'$$, 'portions réglées sur un plat');
select throws_ok($$update public.planning_inbox set portions = 0 where title = 'Soupe'$$, '23514', null, 'au moins 1 portion');

-- Planifié à la main : les portions passent au repas
select public.plan_inbox_item((select id from public.planning_inbox where title = 'Lasagnes'), '2026-11-10', 'DINNER', '{11111111-1111-1111-1111-111111111111}');
select is((select portions from public.meals m join public.recipes r on r.id = m.recipe_id where r.title = 'Lasagnes'), 6::smallint, 'le repas garde les portions du plat');

-- Planifié par semaine : portions de chaque entrée (restes à 0)
select is(
  public.plan_week(jsonb_build_array(
    jsonb_build_object('item_id', (select id from public.planning_inbox where title = 'Soupe'), 'meal_date', '2026-11-11', 'slot', 'DINNER',
      'people', '{11111111-1111-1111-1111-111111111111}', 'cook_id', null, 'portions', 4),
    jsonb_build_object('item_id', (select id from public.planning_inbox where title = 'Soupe'), 'meal_date', '2026-11-12', 'slot', 'LUNCH',
      'people', '{11111111-1111-1111-1111-111111111111}', 'cook_id', null, 'portions', 0)
  )),
  2,
  'deux repas créés'
);
select results_eq(
  $$select m.meal_date::text, m.portions from public.meals m join public.recipes r on r.id = m.recipe_id where r.title = 'Soupe' order by m.meal_date$$,
  $$values ('2026-11-11', 4::smallint), ('2026-11-12', 0::smallint)$$,
  'premier repas cuisiné pour 4, puis des restes'
);
select throws_ok($$update public.meals set portions = 100$$, '23514', null, '99 portions au plus');

-- Origine des articles de courses
insert into public.shopping_lists (name) values ('Courses');
select lives_ok(
  $$insert into public.shopping_items (list_id, name, sources) select id, 'Farine', '{"Lasagnes : 200 g farine"}' from public.shopping_lists limit 1$$,
  'article avec sa ligne de recette'
);
select results_eq($$select sources from public.shopping_items$$, $$values ('{"Lasagnes : 200 g farine"}'::text[])$$, 'origine relue');
select throws_ok(
  $$update public.shopping_items set sources = array_fill('x'::text, array[31])$$,
  '23514', null, '30 lignes d''origine au plus'
);

select * from finish();
rollback;
