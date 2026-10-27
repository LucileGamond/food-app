-- Source, temps et sous-parties des recettes ; compatibilité avec une application pas encore mise à jour.
begin;
select plan(9);

delete from public.meals;
delete from public.planning_inbox;
delete from public.recipes;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Application à jour : tout est enregistré
create temporary table ids (id uuid) on commit drop;
insert into ids select public.save_recipe(
  'Tarte',
  '[{"name":"bananes","quantity":"5","unit":"","note":"","section":""},
    {"name":"beurre","quantity":"50","unit":"g","note":"","section":" Pour le streusel "}]'::jsonb,
  null, '1. Cuire.', null, 6, '{}', ' Pâtisserie maison, p. 146 ', 10, 120, 40
);
select is((select source from public.recipes), 'Pâtisserie maison, p. 146', 'source enregistrée');
select is((select array[prep_minutes, rest_minutes, cook_minutes] from public.recipes), array[10, 120, 40], 'temps enregistrés');
select is((select array_agg(section order by position) from public.recipe_ingredients), array[null, 'Pour le streusel'], 'sous-parties enregistrées');

-- Ancienne version de l'application : ni source, ni temps, ni sous-parties envoyés → tout est conservé
select public.save_recipe(
  'Tarte modifiée',
  '[{"name":"bananes","quantity":"4","unit":"","note":""},{"name":"beurre","quantity":"50","unit":"g","note":""}]'::jsonb,
  (select id from ids), '1. Cuire.', null, 6, '{}'
);
select is((select title from public.recipes), 'Tarte modifiée', 'modification enregistrée');
select is((select source from public.recipes), 'Pâtisserie maison, p. 146', 'source conservée');
select is((select array[prep_minutes, rest_minutes, cook_minutes] from public.recipes), array[10, 120, 40], 'temps conservés');
select is((select array_agg(section order by position) from public.recipe_ingredients), array[null, 'Pour le streusel'], 'sous-parties conservées');

-- Application à jour qui efface : '' et 0
select public.save_recipe(
  'Tarte modifiée',
  '[{"name":"bananes","quantity":"4","unit":"","note":"","section":""}]'::jsonb,
  (select id from ids), null, null, 6, '{}', '', 0, 0, 0
);
select is((select array[source, prep_minutes::text, rest_minutes::text, cook_minutes::text] from public.recipes), array[null, null, null, null]::text[], 'source et temps effacés');
select throws_ok(
  $$select public.save_recipe('X', jsonb_build_array(jsonb_build_object('name', 'a', 'section', repeat('s', 81))))$$,
  '23514', null, 'sous-partie de plus de 80 caractères refusée'
);

select * from finish();
rollback;
