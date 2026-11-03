begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

delete from public.meals;
delete from public.recipes;
delete from public.planning_inbox;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Élément « À planifier » créé depuis des photos, puis planifié : recette ponctuelle avec ses photos
select public.add_to_inbox('Page du livre', null, null, 'plan', array['pending/aaaaaaaa-0000-0000-0000-000000000001.jpg', 'pending/aaaaaaaa-0000-0000-0000-000000000002.jpg']);
select public.plan_inbox_item((select id from public.planning_inbox), '2026-11-10', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[]);
select is((select count(*)::int from public.recipe_photos), 2, 'photos rattachées à la recette ponctuelle');

-- Repas dupliqué : la copie garde les photos (mêmes fichiers)
select public.duplicate_meal((select id from public.meals), '2026-11-11', 'DINNER');
select is((select count(*)::int from public.recipe_photos), 4, 'copie avec les photos');
select is((select count(distinct recipe_id)::int from public.recipe_photos), 2, 'une recette ponctuelle par repas');

-- Les fichiers encore utilisés (le ménage de nuit garde ceux-là)
reset role;
select set_eq(
  $$select * from public.referenced_files('recipe-photos')$$,
  $$values ('pending/aaaaaaaa-0000-0000-0000-000000000001.jpg'), ('pending/aaaaaaaa-0000-0000-0000-000000000002.jpg')$$,
  'photos temporaires encore utilisées'
);
set local role authenticated;
select throws_ok($$select * from public.referenced_files('recipe-photos')$$, '42501', null, 'liste réservée au serveur');

-- Recette ponctuelle sauvegardée : ses photos temporaires sont retirées, celles de la copie restent
update public.recipes set is_saved = true
where id = (select recipe_id from public.meals where meal_date = '2026-11-10');
select is(
  (select count(*)::int from public.recipe_photos p join public.meals m on m.recipe_id = p.recipe_id where m.meal_date = '2026-11-10'),
  0, 'photos temporaires retirées une fois la recette enregistrée'
);
select is((select count(*)::int from public.recipe_photos), 2, 'la copie garde les siennes');

-- Une photo propre à une recette reste unique
insert into public.recipes (id, is_saved, title) values ('bbbbbbbb-0000-0000-0000-000000000001', true, 'Gratin');
insert into public.recipe_photos (recipe_id, storage_path, position) values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001/1.jpg', 0);
select throws_ok(
  $$insert into public.recipe_photos (recipe_id, storage_path, position) values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001/1.jpg', 1)$$,
  '23505', null, 'chemin d''une photo propre unique'
);

select * from finish();
rollback;
