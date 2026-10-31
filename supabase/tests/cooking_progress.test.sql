-- Progression du mode cuisine : partagée, une par recette, supprimée avec la recette.
begin;
select plan(5);

delete from public.meals;
delete from public.planning_inbox;
delete from public.recipes;

set local role anon;
select throws_ok('select count(*) from public.cooking_progress', '42501', null, 'anon ne lit pas la progression');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temporary table ids (v uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select public.save_recipe(p_title := 'Brioche', p_ingredients := '[{"name":"farine"}]'::jsonb);

select lives_ok(
  $$insert into public.cooking_progress (recipe_id, ingredients, steps) values ((select v from ids), '{0}', '{0,1}')$$,
  'Lucile enregistre sa progression'
);
select throws_ok(
  $$insert into public.cooking_progress (recipe_id) values ((select v from ids))$$,
  '23505', null, 'une seule progression par recette'
);

-- Eric reprend là où Lucile s'est arrêtée
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
update public.cooking_progress set steps = '{0,1,2}' where recipe_id = (select v from ids);
select is((select steps from public.cooking_progress), '{0,1,2}'::int[], 'Eric la complète');

delete from public.recipes where id = (select v from ids);
select is((select count(*)::int from public.cooking_progress), 0, 'supprimée avec la recette');

select * from finish();
rollback;
