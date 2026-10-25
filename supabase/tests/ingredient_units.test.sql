begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.planning_inbox;
delete from public.meals;
delete from public.recipes;

-- Reconnaissance des unités (mêmes règles que src/lib/units.ts)
select is(public.normalize_unit('Cuillères à soupe'), 'c. à s.', 'variante reconnue');
select is(public.normalize_unit('pièce'), '', '« pièce » = sans unité');
select is(public.normalize_unit('pluche'), null, 'unité inconnue');
select results_eq(
  $$select recognized, unit, rest from public.split_unit('c. à s. bombée(s)')$$,
  $$values (true, 'c. à s.', 'bombée(s)')$$,
  'unité en début de texte, le reste en précision'
);
select results_eq(
  $$select recognized, unit, rest from public.split_unit('petit morceau')$$,
  $$values (true, 'morceau', 'petit')$$,
  'unité en fin de texte'
);
select results_eq($$select recognized from public.split_unit('pluche')$$, $$values (false)$$, 'rien de reconnu');
select results_eq($$select recognized, unit from public.split_unit(null)$$, $$values (true, null::text)$$, 'sans unité');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Enregistrement : unités normalisées, précisions conservées, unité inconnue rangée dans la précision
select public.save_recipe('Test', '[
  {"name":"sucre","quantity":"1","unit":"cuillère à soupe","note":"bombée"},
  {"name":"gingembre","quantity":"1","unit":"petit morceau"},
  {"name":"cerfeuil","quantity":"2","unit":"pluche","note":"frais"},
  {"name":"œufs","quantity":"3","unit":""},
  {"name":"farine","quantity":"200","unit":"g","note":""}
]');
select results_eq(
  $$select name, quantity, unit, note from public.recipe_ingredients order by position$$,
  $$values
    ('sucre', 1::numeric, 'c. à s.', 'bombée'),
    ('gingembre', 1::numeric, 'morceau', 'petit'),
    ('cerfeuil', null::numeric, null::text, '2 pluche, frais'),
    ('œufs', 3::numeric, null::text, null::text),
    ('farine', 200::numeric, 'g', null::text)$$,
  'unités normalisées à l''enregistrement'
);

-- La base refuse une unité hors liste et une précision trop longue
select throws_ok(
  $$insert into public.recipe_ingredients (recipe_id, position, name, unit) select id, 9, 'x', 'pluche' from public.recipes limit 1$$,
  '23514', null, 'unité hors liste refusée'
);
select throws_ok(
  format($$insert into public.recipe_ingredients (recipe_id, position, name, note) select id, 9, 'x', %L from public.recipes limit 1$$, repeat('x', 201)),
  '23514', null, 'précision trop longue refusée'
);
select lives_ok(
  $$insert into public.recipe_ingredients (recipe_id, position, name, unit, note) select id, 9, 'x', 'c. à c.', 'rase' from public.recipes limit 1$$,
  'unité de la liste et précision acceptées'
);

select * from finish();
rollback;
