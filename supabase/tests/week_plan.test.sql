begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.meal_presence_rules;
delete from public.planning_inbox;
delete from public.meals;
delete from public.recipes;

-- Règles de présence : lisibles par anon ? non.
set local role anon;
select throws_ok('select count(*) from public.meal_presence_rules', '42501', null, 'anon ne lit pas les règles');
select throws_ok($$select public.plan_week('[]')$$, '42501', null, 'anon ne planifie pas');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Chacun écrit sa règle, et le foyer les lit toutes
select lives_ok(
  $$insert into public.meal_presence_rules (weekday_lunch_at_work, ignored_keywords) values (true, '{escalade}')$$,
  'Lucile enregistre sa règle'
);
select throws_ok(
  $$insert into public.meal_presence_rules (profile_id) values ('22222222-2222-2222-2222-222222222222')$$,
  '42501', null, 'pas la règle de l''autre'
);
select throws_ok(
  $$update public.meal_presence_rules set ignored_keywords = array_fill('x'::text, array[21])$$,
  '23514', null, '20 mots-clés au plus'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select results_eq(
  $$select weekday_lunch_at_work, ignored_keywords from public.meal_presence_rules$$,
  $$values (true, '{escalade}'::text[])$$,
  'Eric lit la règle de Lucile'
);
select is_empty(
  $$update public.meal_presence_rules set weekday_lunch_at_work = false returning 1$$,
  'Eric ne modifie pas la règle de Lucile'
);
select lives_ok($$insert into public.meal_presence_rules default values$$, 'Eric enregistre la sienne (valeurs par défaut)');
select results_eq(
  $$select weekday_lunch_at_work, ignored_keywords from public.meal_presence_rules where profile_id = '22222222-2222-2222-2222-222222222222'$$,
  $$values (false, '{}'::text[])$$,
  'par défaut : à la maison le midi, aucun mot-clé'
);

-- Planifier la semaine : repas créés, cuisinier, restes, éléments retirés
select public.add_to_inbox('Lasagnes');
select public.add_to_inbox('Soupe', 'https://exemple.fr/soupe');
select public.add_to_inbox('Raclette');
select public.save_recipe('Curry', '[{"name":"riz"}]');
select public.add_to_inbox(p_recipe_id => (select id from public.recipes where title = 'Curry'));

select is(
  public.plan_week(jsonb_build_array(
    jsonb_build_object('item_id', (select id from public.planning_inbox where title = 'Lasagnes'), 'meal_date', '2026-11-10', 'slot', 'DINNER',
      'people', '{11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222}', 'cook_id', '22222222-2222-2222-2222-222222222222'),
    jsonb_build_object('item_id', (select id from public.planning_inbox where title = 'Lasagnes'), 'meal_date', '2026-11-11', 'slot', 'LUNCH',
      'people', '{22222222-2222-2222-2222-222222222222}', 'cook_id', null),
    jsonb_build_object('item_id', (select id from public.planning_inbox where title = 'Soupe'), 'meal_date', '2026-11-09', 'slot', 'DINNER',
      'people', '{11111111-1111-1111-1111-111111111111}', 'cook_id', '11111111-1111-1111-1111-111111111111'),
    jsonb_build_object('item_id', (select id from public.planning_inbox where title = 'Curry'), 'meal_date', '2026-11-12', 'slot', 'DINNER',
      'people', '{22222222-2222-2222-2222-222222222222}', 'cook_id', '22222222-2222-2222-2222-222222222222')
  )),
  4, '4 repas créés'
);
select results_eq(
  $$select m.meal_date::text, m.slot::text, r.title, r.url, m.cook_id::text, cardinality(m.people)
    from public.meals m join public.recipes r on r.id = m.recipe_id order by m.meal_date, m.slot$$,
  $$values
    ('2026-11-09', 'DINNER', 'Soupe', 'https://exemple.fr/soupe', '11111111-1111-1111-1111-111111111111', 1),
    ('2026-11-10', 'DINNER', 'Lasagnes', null::text, '22222222-2222-2222-2222-222222222222', 2),
    ('2026-11-11', 'LUNCH', 'Lasagnes', null::text, null::text, 1),
    ('2026-11-12', 'DINNER', 'Curry', null::text, '22222222-2222-2222-2222-222222222222', 1)$$,
  'repas avec recette, cuisinier et personnes'
);
select is(
  (select count(distinct recipe_id)::int from public.meals m join public.recipes r on r.id = m.recipe_id where r.title = 'Lasagnes'),
  2, 'restes d''une recette ponctuelle : une copie par repas'
);
select is(
  (select r.is_saved from public.meals m join public.recipes r on r.id = m.recipe_id where r.title = 'Curry'),
  true, 'recette enregistrée gardée telle quelle'
);
select results_eq($$select title from public.planning_inbox$$, $$values ('Raclette')$$, 'éléments planifiés retirés de la liste');

-- Tout ou rien : un élément inconnu annule la planification
select throws_ok(
  format('select public.plan_week(%L)', jsonb_build_array(
    jsonb_build_object('item_id', (select id from public.planning_inbox where title = 'Raclette'), 'meal_date', '2026-11-13', 'slot', 'LUNCH',
      'people', '{11111111-1111-1111-1111-111111111111}', 'cook_id', null),
    jsonb_build_object('item_id', gen_random_uuid(), 'meal_date', '2026-11-13', 'slot', 'DINNER',
      'people', '{11111111-1111-1111-1111-111111111111}', 'cook_id', null)
  )),
  'P0002', null, 'élément inconnu : erreur'
);
select results_eq($$select title from public.planning_inbox$$, $$values ('Raclette')$$, 'rien n''a été planifié');

select * from finish();
rollback;
