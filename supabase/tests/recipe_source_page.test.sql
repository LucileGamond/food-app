-- Livre et page séparés (découpage des sources existantes) et valeurs nutritionnelles : save_recipe, ancienne version
-- de l'application.
begin;
select plan(15);

delete from public.meals;
delete from public.planning_inbox;
delete from public.recipes;

select is(public.split_source('Pâtisserie maison, p. 146'), array['Pâtisserie maison', '146'], 'livre et page');
select is(public.split_source('p. 146'), array[null, '146'], 'page seule');
select is(public.split_source('Magazine 2024 – pp. 12-13'), array['Magazine 2024', '12-13'], 'plusieurs pages');
select is(public.split_source('Ottolenghi Simple'), null, 'sans page : rien à découper');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temporary table ids (id uuid) on commit drop;
create function pg_temp.source() returns text[] language sql as $$ select array[source, source_page] from public.recipes $$;

-- Application à jour : livre et page dans deux paramètres, la source n'est pas découpée
insert into ids select public.save_recipe(
  p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb,
  p_source := ' Pâtisserie maison ', p_source_page := ' 146 '
);
select is(pg_temp.source(), array['Pâtisserie maison', '146'], 'livre et page enregistrés');

-- Ancienne version : pas de page envoyée → page conservée
select public.save_recipe(p_recipe_id := (select id from ids), p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb, p_source := 'Pâtisserie maison');
select is(pg_temp.source(), array['Pâtisserie maison', '146'], 'page conservée par une ancienne version');

-- Ancienne version qui écrit la page dans la source : découpée
select public.save_recipe(p_recipe_id := (select id from ids), p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb, p_source := 'Le grand livre, p. 12');
select is(pg_temp.source(), array['Le grand livre', '12'], 'source « livre, p. 12 » découpée');
select public.save_recipe(p_recipe_id := (select id from ids), p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb, p_source := 'p. 30');
select is(pg_temp.source(), array[null, '30'], 'page seule : livre effacé');

-- '' efface
select public.save_recipe(p_recipe_id := (select id from ids), p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb, p_source := '', p_source_page := '');
select is(pg_temp.source(), array[null, null]::text[], 'livre et page effacés');

select throws_ok(
  $$select public.save_recipe(p_title := 'X', p_ingredients := '[{"name":"a"}]'::jsonb, p_source_page := repeat('1', 21))$$,
  '23514', null, 'page de plus de 20 caractères refusée'
);

-- Valeurs nutritionnelles
create function pg_temp.nutrition() returns text[] language sql as $$
  select array[nutrition_per, kcal::text, carbs_g::text, protein_g::text, fat_g::text] from public.recipes
$$;
select public.save_recipe(p_recipe_id := (select id from ids), p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb,
  p_nutrition := '{"per":"100 g","kcal":320,"carbs":42.5,"protein":4,"fat":15.2}'::jsonb);
select is(pg_temp.nutrition(), array['100 g', '320', '42.5', '4.0', '15.2'], 'valeurs nutritionnelles enregistrées');
select public.save_recipe(p_recipe_id := (select id from ids), p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb, p_source := '');
select is(pg_temp.nutrition(), array['100 g', '320', '42.5', '4.0', '15.2'], 'conservées par une ancienne version');
select public.save_recipe(p_recipe_id := (select id from ids), p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb,
  p_nutrition := '{"kcal":450}'::jsonb);
select is(pg_temp.nutrition(), array['portion', '450', null, null, null], 'par portion par défaut');
select public.save_recipe(p_recipe_id := (select id from ids), p_title := 'Tarte', p_ingredients := '[{"name":"bananes"}]'::jsonb, p_nutrition := '{}'::jsonb);
select is(pg_temp.nutrition(), array[null, null, null, null, null]::text[], 'effacées');
select throws_ok(
  $$select public.save_recipe(p_title := 'X', p_ingredients := '[{"name":"a"}]'::jsonb, p_nutrition := '{"per":"bol","kcal":1}'::jsonb)$$,
  '23514', null, 'base inconnue refusée'
);

select * from finish();
rollback;
