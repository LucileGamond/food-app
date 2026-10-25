begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.planning_inbox;
delete from public.meals;
delete from public.recipes;

set local role anon;
select throws_ok('select count(*) from public.planning_inbox', '42501', null, 'anon ne lit pas la liste');
select throws_ok($$select public.add_to_inbox('Raclette')$$, '42501', null, 'anon n''ajoute rien');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Ajouts
select lives_ok($$select public.add_to_inbox('Raclette')$$, 'idée ajoutée');
select lives_ok($$select public.add_to_inbox('Crêpes', 'https://www.exemple.fr/crepes')$$, 'lien ajouté');
select throws_ok($$select public.add_to_inbox('Crêpes bis', 'http://exemple.fr/crepes/')$$, '23505', null, 'même lien refusé');
select throws_ok($$select public.add_to_inbox('  ')$$, '22023', null, 'titre requis');

-- Un lien déjà enregistré comme recette devient la recette
select public.save_recipe('Curry maison', '[{"name":"riz"}]', p_url => 'https://exemple.fr/curry');
select public.add_to_inbox('Titre de la page', 'https://www.exemple.fr/curry');
select results_eq(
  $$select title, url, recipe_id is not null from public.planning_inbox where title = 'Curry maison'$$,
  $$values ('Curry maison', null::text, true)$$,
  'lien d''une recette enregistrée → élément recette'
);
select throws_ok(
  format('select public.add_to_inbox(p_recipe_id => %L)', (select id from public.recipes where title = 'Curry maison')),
  '23505', null, 'même recette refusée'
);

-- Planifier : repas créé, élément retiré
select public.plan_inbox_item(
  (select id from public.planning_inbox where title = 'Crêpes'), '2026-10-22', 'DINNER', array['11111111-1111-1111-1111-111111111111']::uuid[]
);
select results_eq(
  $$select r.title, r.url, r.is_saved, m.slot::text from public.meals m join public.recipes r on r.id = m.recipe_id where m.meal_date = '2026-10-22'$$,
  $$values ('Crêpes', 'https://www.exemple.fr/crepes', false, 'DINNER')$$,
  'lien planifié → repas avec recette ponctuelle'
);
select is((select count(*)::int from public.planning_inbox where title = 'Crêpes'), 0, 'élément retiré après planification');

select public.plan_inbox_item(
  (select id from public.planning_inbox where title = 'Curry maison'), '2026-10-23', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[]
);
select is(
  (select r.is_saved from public.meals m join public.recipes r on r.id = m.recipe_id where m.meal_date = '2026-10-23'),
  true, 'recette planifiée → repas avec la recette enregistrée'
);

-- Erreurs : personnes manquantes (l'élément reste), élément inconnu
select throws_ok(
  format('select public.plan_inbox_item(%L, %L, %L, %L)', (select id from public.planning_inbox where title = 'Raclette'), '2026-10-24', 'LUNCH', '{}'),
  '23514', null, 'au moins une personne'
);
select throws_ok(
  $$select public.plan_inbox_item('00000000-0000-0000-0000-000000000000', '2026-10-24', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[])$$,
  'P0002', null, 'élément introuvable'
);

select * from finish();
rollback;
