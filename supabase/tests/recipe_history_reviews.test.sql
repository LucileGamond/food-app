-- Avis de chacun sur les recettes (droits, enregistrement, retrait) et historique tiré du planning.
begin;
select plan(17);

delete from public.meals;
delete from public.planning_inbox;
delete from public.recipes;

-- Anonyme : aucun accès
set local role anon;
select throws_ok('select count(*) from public.recipe_reviews', '42501', null, 'anon ne lit pas les avis');
select throws_ok($$select * from public.recipe_history('2026-10-31')$$, '42501', null, 'anon ne lit pas l’historique');
reset role;

-- Lucile
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values ('curry', public.save_recipe(p_title := 'Curry', p_ingredients := '[{"name":"lentilles"}]'::jsonb));
insert into ids values ('tarte', public.save_recipe(p_title := 'Tarte', p_ingredients := '[{"name":"farine"}]'::jsonb));
create function pg_temp.id(p_key text) returns uuid language sql as $$ select v from ids where k = p_key $$;

select lives_ok($$select public.save_recipe_review(pg_temp.id('curry'), 4, '  Moins de sucre  ')$$, 'Lucile note la recette');
select results_eq(
  $$select rating::int, comment from public.recipe_reviews where recipe_id = pg_temp.id('curry')$$,
  $$values (4, 'Moins de sucre')$$,
  'note et commentaire (sans espaces autour) enregistrés'
);
select lives_ok($$select public.save_recipe_review(pg_temp.id('curry'), null, 'Top')$$, 'Lucile modifie son avis');
select results_eq(
  $$select rating, comment from public.recipe_reviews where recipe_id = pg_temp.id('curry')$$,
  $$values (null::smallint, 'Top')$$,
  'un seul avis par personne, remplacé'
);
select throws_ok($$select public.save_recipe_review(pg_temp.id('curry'), 6, null)$$, '23514', null, 'note de 1 à 5');
select throws_ok(
  $$insert into public.recipe_reviews (recipe_id, profile_id, rating) values (pg_temp.id('tarte'), '22222222-2222-2222-2222-222222222222', 1)$$,
  '42501', null, 'Lucile n’écrit pas l’avis d’Eric'
);

-- Eric : lit l'avis de Lucile, ne peut ni le modifier ni le retirer
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.recipe_reviews), 1, 'Eric lit l’avis de Lucile');
update public.recipe_reviews set comment = 'Bof' where profile_id = '11111111-1111-1111-1111-111111111111';
delete from public.recipe_reviews where profile_id = '11111111-1111-1111-1111-111111111111';
select is((select comment from public.recipe_reviews where profile_id = '11111111-1111-1111-1111-111111111111'), 'Top', 'Eric ne modifie ni ne retire l’avis de Lucile');
select lives_ok($$select public.save_recipe_review(pg_temp.id('curry'), 5)$$, 'Eric ajoute son avis');
select is((select count(*)::int from public.recipe_reviews where recipe_id = pg_temp.id('curry')), 2, 'un avis chacun');

-- Sans note ni commentaire : l'avis est retiré
select lives_ok($$select public.save_recipe_review(pg_temp.id('curry'), null, '   ')$$, 'Eric vide son avis');
select is((select count(*)::int from public.recipe_reviews where profile_id = '22222222-2222-2222-2222-222222222222'), 0, 'avis vide retiré');

-- Historique : repas passés (jusqu'à aujourd'hui inclus), dernier, prochain
select public.create_meal('2026-10-01', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[], pg_temp.id('curry'));
select public.create_meal('2026-10-31', 'DINNER', array['11111111-1111-1111-1111-111111111111']::uuid[], pg_temp.id('curry'));
select public.create_meal('2026-11-05', 'DINNER', array['11111111-1111-1111-1111-111111111111']::uuid[], pg_temp.id('curry'));
select public.create_meal('2026-11-08', 'LUNCH', array['11111111-1111-1111-1111-111111111111']::uuid[], pg_temp.id('tarte'));
select results_eq(
  $$select times_cooked, last_cooked, next_planned from public.recipe_history('2026-10-31') where recipe_id = pg_temp.id('curry')$$,
  $$values (2, '2026-10-31'::date, '2026-11-05'::date)$$,
  'cuisinée 2 fois, dernière aujourd’hui, prochaine le 5'
);
select results_eq(
  $$select times_cooked, last_cooked, next_planned from public.recipe_history('2026-10-31', pg_temp.id('tarte'))$$,
  $$values (0, null::date, '2026-11-08'::date)$$,
  'une seule recette : jamais cuisinée, prévue'
);

-- Recette supprimée : ses avis aussi
delete from public.meals where recipe_id = pg_temp.id('curry');
delete from public.recipes where id = pg_temp.id('curry');
select is((select count(*)::int from public.recipe_reviews), 0, 'avis supprimés avec la recette');

select * from finish();
rollback;
