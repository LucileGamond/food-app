begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.planning_inbox;
delete from public.meals;
delete from public.recipes;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Clé de comparaison
select is(public.recipe_url_key('https://www.Exemple.fr/Curry/#etapes'), 'exemple.fr/curry', 'clé : sans protocole, www, ancre, / final ; minuscules');
select is(public.recipe_url_key('  '), null, 'clé vide → null');

-- Une recette sauvegardée avec un lien
select public.save_recipe('Curry', '[{"name":"riz"}]', p_url => 'https://exemple.fr/curry');
select throws_ok(
  $$select public.save_recipe('Autre curry', '[{"name":"riz"}]', p_url => 'http://www.exemple.fr/curry/')$$,
  '23505', null, 'lien déjà utilisé par une recette sauvegardée : refusé'
);
select lives_ok(
  $$select public.save_recipe('Sans lien 1', '[{"name":"x"}]'), public.save_recipe('Sans lien 2', '[{"name":"x"}]')$$,
  'plusieurs recettes sans lien'
);

-- Les recettes ponctuelles peuvent partager le lien
select public.create_meal('2026-10-20', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[], p_adhoc_title => 'Curry du lundi', p_adhoc_url => 'https://exemple.fr/curry');
select public.create_meal('2026-10-21', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[], p_adhoc_title => 'Curry du mardi', p_adhoc_url => 'https://exemple.fr/curry');
select is((select count(*)::int from public.recipes where not is_saved and url = 'https://exemple.fr/curry'), 2, 'recettes ponctuelles avec le même lien autorisées');

-- Sauvegarder une ponctuelle avec ce lien : refusé
select throws_ok(
  format('select public.save_recipe(%L, %L, %L, p_url => %L)', 'Curry du lundi', '[{"name":"riz"}]', (select id from public.recipes where title = 'Curry du lundi'), 'https://exemple.fr/curry'),
  '23505', null, 'sauvegarde d''une ponctuelle avec un lien déjà pris : refusée'
);

-- Recherche
select is((select title from public.find_saved_recipe_by_url('https://WWW.exemple.fr/curry#x')), 'Curry', 'recherche par lien normalisé');
select is(
  (select count(*)::int from public.find_saved_recipe_by_url('https://exemple.fr/curry', (select id from public.recipes where title = 'Curry'))),
  0, 'la recette en cours de modification est ignorée'
);

-- Bascule : les repas passent sur la recette sauvegardée, la ponctuelle disparaît
select is(
  public.use_saved_recipe((select id from public.recipes where title = 'Curry du lundi'), (select id from public.recipes where title = 'Curry')),
  1, 'un repas basculé'
);
select is((select count(*)::int from public.recipes where title = 'Curry du lundi'), 0, 'recette ponctuelle supprimée');
select throws_ok(
  format('select public.use_saved_recipe(%L, %L)', (select id from public.recipes where title = 'Curry'), (select id from public.recipes where title = 'Sans lien 1')),
  'P0002', null, 'la source doit être une recette ponctuelle'
);
select throws_ok(
  format('select public.use_saved_recipe(%L, %L)', (select id from public.recipes where title = 'Curry du mardi'), (select id from public.recipes where title = 'Curry du mardi')),
  'P0002', null, 'la cible doit être une recette sauvegardée'
);

select * from finish();
rollback;
