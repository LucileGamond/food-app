begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- Les profils sont créés automatiquement à partir des comptes (seed)
select results_eq(
  'select display_name from public.profiles order by display_name',
  array['Eric', 'Lucile'],
  'un profil par compte, avec le nom affiché'
);

-- ---------------------------------------------------------------------------
-- Anonyme : aucun accès
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.meals', '42501', null, 'anon ne lit pas les repas');
select throws_ok('select count(*) from public.recipes', '42501', null, 'anon ne lit pas les recettes');
select throws_ok('select count(*) from public.profiles', '42501', null, 'anon ne lit pas les profils');
select throws_ok(
  $$select public.create_meal('2026-10-20', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[], null, 'Pâtes')$$,
  '42501', null, 'anon ne crée pas de repas'
);
reset role;

-- ---------------------------------------------------------------------------
-- Connecté en Lucile
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

-- Création d'un repas avec une recette ponctuelle
insert into ids values ('adhoc_meal', public.create_meal(
  '2026-10-20', 'LUNCH',
  array['22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111']::uuid[],
  null, '  Pâtes tomate  ', 'avec du basilic', 'https://exemple.fr/pates'
));
insert into ids select 'adhoc_recipe', recipe_id from public.meals where id = (select v from ids where k = 'adhoc_meal');

select is((select is_saved from public.recipes where id = (select v from ids where k = 'adhoc_recipe')), false, 'recette ponctuelle non sauvegardée');
select is((select title from public.recipes where id = (select v from ids where k = 'adhoc_recipe')), 'Pâtes tomate', 'titre nettoyé');
select is(
  (select people from public.meals where id = (select v from ids where k = 'adhoc_meal')),
  array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[],
  'personnes dédoublonnées et triées'
);
select is((select created_by from public.meals where id = (select v from ids where k = 'adhoc_meal')),
  '11111111-1111-1111-1111-111111111111'::uuid, 'created_by = utilisateur connecté');

-- Validations de create_meal
select throws_ok(
  $$select public.create_meal('2026-10-20', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[])$$,
  '22023', null, 'ni recette ni titre : refusé'
);
select throws_ok(
  $$select public.create_meal('2026-10-20', 'LUNCH', '{}'::uuid[], null, 'Pâtes')$$,
  '23514', null, 'au moins une personne'
);
select throws_ok(
  $$select public.create_meal('2026-10-20', 'LUNCH', array['33333333-3333-3333-3333-333333333333']::uuid[], null, 'Pâtes')$$,
  '23503', null, 'personne inconnue refusée'
);
select throws_ok(
  $$select public.create_meal('2026-10-20', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[], null, '   ')$$,
  '23514', null, 'titre vide refusé'
);
select throws_ok(
  $$select public.create_meal('2026-10-20', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[], null, 'Pâtes', null, 'ftp://x')$$,
  '23514', null, 'URL non http(s) refusée'
);
select throws_ok(
  format($$select public.create_meal('2026-10-20', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[], %L)$$,
    (select v from ids where k = 'adhoc_recipe')),
  'P0002', null, 'une recette ponctuelle ne peut pas être choisie comme recette sauvegardée'
);

-- Recette sauvegardée
select throws_ok(
  $$select public.save_recipe(p_title => 'Curry', p_ingredients => '[]'::jsonb, p_servings => 4)$$,
  '22023', null, 'au moins un ingrédient pour une recette sauvegardée'
);
insert into ids values ('saved_recipe', public.save_recipe(
  p_title => 'Curry de légumes', p_notes => 'Étape 1', p_servings => 4, p_tags => array['végé', 'rapide'],
  p_ingredients => '[{"name":"Pois chiches","quantity":"400","unit":"g"},{"name":"Lait de coco","quantity":"","unit":""}]'::jsonb
));
select is((select is_saved from public.recipes where id = (select v from ids where k = 'saved_recipe')), true, 'recette sauvegardée');
select results_eq(
  format('select name, quantity, unit, position from public.recipe_ingredients where recipe_id = %L order by position',
    (select v from ids where k = 'saved_recipe')),
  $$values ('Pois chiches'::text, 400::numeric, 'g'::text, 0), ('Lait de coco', null, null, 1)$$,
  'ingrédients enregistrés dans l''ordre, champs vides → null'
);
select throws_ok(
  $$select public.save_recipe(p_title => 'X', p_ingredients => '[{"name":"a"}]'::jsonb, p_servings => 0)$$,
  '23514', null, 'portions > 0'
);

-- Modification : les ingrédients sont remplacés
select public.save_recipe(
  p_recipe_id => (select v from ids where k = 'saved_recipe'), p_title => 'Curry express', p_servings => 2, p_tags => array['végé'],
  p_ingredients => '[{"name":"Pois chiches","quantity":"200","unit":"g"}]'::jsonb
);
select is((select count(*)::int from public.recipe_ingredients where recipe_id = (select v from ids where k = 'saved_recipe')), 1, 'ingrédients remplacés');

-- Repas avec la recette sauvegardée
insert into ids values ('saved_meal', public.create_meal(
  '2026-10-21', 'DINNER', array['11111111-1111-1111-1111-111111111111']::uuid[], (select v from ids where k = 'saved_recipe')
));

-- Suppression bloquée d'une recette utilisée
select throws_ok(
  format('delete from public.recipes where id = %L', (select v from ids where k = 'saved_recipe')),
  '23503', null, 'suppression d''une recette utilisée bloquée'
);

-- Duplication
insert into ids values ('dup_saved', public.duplicate_meal((select v from ids where k = 'saved_meal'), '2026-10-22', 'LUNCH'));
select is(
  (select recipe_id from public.meals where id = (select v from ids where k = 'dup_saved')),
  (select v from ids where k = 'saved_recipe'),
  'dupliquer une recette sauvegardée garde la même recette'
);
insert into ids values ('dup_adhoc', public.duplicate_meal((select v from ids where k = 'adhoc_meal'), '2026-10-20', 'LUNCH'));
select isnt(
  (select recipe_id from public.meals where id = (select v from ids where k = 'dup_adhoc')),
  (select v from ids where k = 'adhoc_recipe'),
  'dupliquer une recette ponctuelle la copie'
);
select is(
  (select title from public.recipes r join public.meals m on m.recipe_id = r.id where m.id = (select v from ids where k = 'dup_adhoc')),
  'Pâtes tomate', 'la copie garde le titre'
);

-- update_meal : recette ponctuelle modifiée sur place
select public.update_meal((select v from ids where k = 'adhoc_meal'),
  array['11111111-1111-1111-1111-111111111111']::uuid[], null, 'Pâtes pesto', '', '');
select is(
  (select row(r.id, r.title, r.notes, r.url)::text from public.recipes r join public.meals m on m.recipe_id = r.id
   where m.id = (select v from ids where k = 'adhoc_meal')),
  row((select v from ids where k = 'adhoc_recipe'), 'Pâtes pesto', null::text, null::text)::text,
  'recette ponctuelle mise à jour sur place, champs vides → null'
);

-- update_meal : passage à une recette sauvegardée → l'ancienne ponctuelle est supprimée
select public.update_meal((select v from ids where k = 'adhoc_meal'),
  array['11111111-1111-1111-1111-111111111111']::uuid[], (select v from ids where k = 'saved_recipe'));
select is((select count(*)::int from public.recipes where id = (select v from ids where k = 'adhoc_recipe')), 0,
  'ancienne recette ponctuelle supprimée');

-- update_meal : passage d'une recette sauvegardée à une ponctuelle → nouvelle recette, la sauvegardée reste
select public.update_meal((select v from ids where k = 'adhoc_meal'),
  array['11111111-1111-1111-1111-111111111111']::uuid[], null, 'Salade');
select is(
  (select r.is_saved from public.recipes r join public.meals m on m.recipe_id = r.id where m.id = (select v from ids where k = 'adhoc_meal')),
  false, 'nouvelle recette ponctuelle créée'
);
select is((select count(*)::int from public.recipes where id = (select v from ids where k = 'saved_recipe')), 1,
  'la recette sauvegardée reste');
select throws_ok(
  $$select public.update_meal('99999999-9999-9999-9999-999999999999', array['11111111-1111-1111-1111-111111111111']::uuid[], null, 'X')$$,
  'P0002', null, 'repas introuvable'
);

-- Sauvegarder une recette ponctuelle : même ligne, le repas reste lié
insert into ids select 'salad_recipe', recipe_id from public.meals where id = (select v from ids where k = 'adhoc_meal');
select public.save_recipe(p_recipe_id => (select v from ids where k = 'salad_recipe'), p_title => 'Salade composée',
  p_ingredients => '[{"name":"Salade"}]'::jsonb);
select is(
  (select r.is_saved from public.recipes r join public.meals m on m.recipe_id = r.id where m.id = (select v from ids where k = 'adhoc_meal')),
  true, 'la recette ponctuelle devient sauvegardée et reste liée'
);

-- Suppression d'un repas
select lives_ok(format('delete from public.meals where id = %L', (select v from ids where k = 'dup_adhoc')), 'suppression d''un repas');
select is((select count(*)::int from public.recipes r where r.title = 'Pâtes tomate'), 0,
  'supprimer un repas supprime sa recette ponctuelle');
delete from public.meals where id in ((select v from ids where k = 'saved_meal'), (select v from ids where k = 'dup_saved'));
select is((select count(*)::int from public.recipes where id = (select v from ids where k = 'saved_recipe')), 1,
  'supprimer un repas garde la recette sauvegardée');

-- updated_at
reset role;
update public.recipes set updated_at = '2000-01-01' where id = (select v from ids where k = 'saved_recipe');
update public.recipes set title = 'Curry' where id = (select v from ids where k = 'saved_recipe');
select is((select updated_at from public.recipes where id = (select v from ids where k = 'saved_recipe')), now(), 'updated_at mis à jour');

-- Bucket photos privé
select is((select public from storage.buckets where id = 'recipe-photos'), false, 'bucket photos privé');

select * from finish();
rollback;
