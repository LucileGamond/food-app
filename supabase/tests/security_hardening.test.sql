begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

delete from public.user_settings;
delete from public.planning_inbox;
delete from public.knit_projects;
delete from public.meals;
delete from public.recipes;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Réglages
select throws_ok(
  $$insert into public.user_settings (hydration_reminded_at) values (now() + interval '1 year')$$, '42501', null,
  'date du rappel réservée au serveur, dès la création'
);
select lives_ok($$insert into public.user_settings (disabled_pages) values ('{}')$$, 'réglages créés par la personne');

-- 2. « À planifier »
select public.add_to_inbox('Page du livre', null, null, 'plan', array['pending/aaaaaaaa-0000-0000-0000-000000000001.jpg']);
select lives_ok($$update public.planning_inbox set title = 'Gratin', list = 'aside'$$, 'titre et liste modifiables');
select throws_ok(
  $$update public.planning_inbox set photos = array['bbbbbbbb-0000-0000-0000-000000000001/photo.jpg']$$, '42501', null,
  'photos non modifiables directement'
);
select throws_ok(
  $$insert into public.planning_inbox (title, photos) values ('Piège', array['bbbbbbbb-0000-0000-0000-000000000001/photo.jpg'])$$,
  '23514', null, 'photos forcément temporaires (pending/)'
);
select throws_ok(
  $$insert into public.planning_inbox (title, photos) values ('Piège', array['pending/../autre.jpg'])$$,
  '23514', null, 'chemin de photo invalide refusé'
);

-- 3. Photos des recettes
insert into public.recipes (id, is_saved, title) values
  ('cccccccc-0000-0000-0000-000000000001', true, 'Gratin'),
  ('cccccccc-0000-0000-0000-000000000002', true, 'Curry');
select lives_ok(
  $$insert into public.recipe_photos (recipe_id, storage_path, position) values ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000009.jpg', 0)$$,
  'photo dans le dossier de sa recette'
);
select throws_ok(
  $$insert into public.recipe_photos (recipe_id, storage_path, position) values ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000008.jpg', 0)$$,
  '23514', null, 'photo d''une autre recette refusée'
);
select lives_ok(
  $$insert into public.recipe_photos (recipe_id, storage_path, position) values ('cccccccc-0000-0000-0000-000000000002', 'pending/aaaaaaaa-0000-0000-0000-000000000007.webp', 0)$$,
  'photo temporaire acceptée'
);

-- 4. Tricot
select throws_ok(
  $$insert into public.knit_projects (title, size) values ('Pull', 'M')$$, '42501', null, 'projet créé seulement par la fonction'
);
select lives_ok(
  $$select public.create_knit_project('Pull', 'M', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.pdf', '[{"title": "Dos"}]')$$,
  'création par la fonction'
);
reset role;
select throws_ok(
  $$update public.knit_projects set pdf_path = '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000002.pdf'$$,
  '23514', null, 'PDF toujours dans le dossier de la propriétaire'
);

select * from finish();
rollback;
