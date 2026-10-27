-- Recettes liées : un ingrédient renvoie à une sous-recette (dans un seul sens).
begin;
select plan(14);

delete from public.meals;
delete from public.planning_inbox;
delete from public.recipes;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temporary table ids (name text primary key, id uuid) on commit drop;
insert into ids values ('pâte', public.save_recipe('Pâte sucrée', '[{"name":"farine","quantity":"250","unit":"g","note":""}]'::jsonb));
insert into ids values ('tarte', public.save_recipe(
  'Tarte',
  jsonb_build_array(
    jsonb_build_object('name', 'pâte sucrée', 'quantity', '200', 'unit', 'g', 'note', 'voir p. 208', 'linked_recipe_id', (select id from ids where name = 'pâte')),
    jsonb_build_object('name', 'bananes', 'quantity', '5', 'unit', '', 'note', '', 'linked_recipe_id', '')
  )
));
create function pg_temp.links() returns uuid[] language sql as $$
  select array_agg(linked_recipe_id order by position) from public.recipe_ingredients where recipe_id = (select id from ids where name = 'tarte')
$$;

select is(pg_temp.links(), array[(select id from ids where name = 'pâte'), null]::uuid[], 'lien enregistré');
select is((select count(*)::int from public.recipe_ingredients where recipe_id = (select id from ids where name = 'pâte') and linked_recipe_id is not null), 0, 'la sous-recette ne référence pas la recette principale');

-- Ancienne version de l'application : pas de linked_recipe_id envoyé → lien conservé, même si l'ingrédient a bougé
select public.save_recipe('Tarte', '[{"name":"bananes","quantity":"4","unit":"","note":""},{"name":"Pâte sucrée ","quantity":"200","unit":"g","note":"voir p. 208"}]'::jsonb, (select id from ids where name = 'tarte'));
select is(pg_temp.links(), array[null, (select id from ids where name = 'pâte')]::uuid[], 'lien conservé par une ancienne version, suivant l’ingrédient');
select public.save_recipe('Tarte', '[{"name":"pâte brisée","quantity":"200","unit":"g","note":""},{"name":"bananes","quantity":"4","unit":"","note":""}]'::jsonb, (select id from ids where name = 'tarte'));
select is(pg_temp.links(), array[null, null]::uuid[], 'ingrédient renommé par une ancienne version : lien abandonné');

-- '' retire le lien ; un identifiant invalide, inconnu ou la recette elle-même est ignoré
select public.save_recipe('Tarte', jsonb_build_array(
  jsonb_build_object('name', 'pâte sucrée', 'linked_recipe_id', ''),
  jsonb_build_object('name', 'bananes', 'linked_recipe_id', 'pas-un-uuid'),
  jsonb_build_object('name', 'sucre', 'linked_recipe_id', gen_random_uuid()),
  jsonb_build_object('name', 'tarte', 'linked_recipe_id', (select id from ids where name = 'tarte'))
), (select id from ids where name = 'tarte'));
select is(pg_temp.links(), array[null, null, null, null]::uuid[], 'lien retiré, liens invalides ignorés');

-- Lier après coup, ingrédient par ingrédient
select lives_ok(
  format('select public.link_recipe_ingredient(%L, 0, %L, %L)', (select id from ids where name = 'tarte'), ' Pâte Sucrée', (select id from ids where name = 'pâte')),
  'lier un ingrédient'
);
select is(pg_temp.links(), array[(select id from ids where name = 'pâte'), null, null, null]::uuid[], 'ingrédient lié');
select throws_ok(
  format('select public.link_recipe_ingredient(%L, 1, %L, %L)', (select id from ids where name = 'tarte'), 'bananes', (select id from ids where name = 'tarte')),
  'P0002', 'Recette liée introuvable', 'une recette ne se lie pas à elle-même'
);
select throws_ok(
  format('select public.link_recipe_ingredient(%L, 9, %L, %L)', (select id from ids where name = 'tarte'), 'bananes', (select id from ids where name = 'pâte')),
  'P0002', 'Ingrédient introuvable', 'ingrédient inexistant refusé'
);
select throws_ok(
  format('select public.link_recipe_ingredient(%L, 1, %L, %L)', (select id from ids where name = 'tarte'), 'pâte sucrée', (select id from ids where name = 'pâte')),
  'P0002', 'Ingrédient introuvable', 'recette modifiée entre-temps : rien n’est lié au mauvais ingrédient'
);

-- Une recette ponctuelle (du planning) ne peut pas être liée
reset role;
with r as (insert into public.recipes (is_saved, title) values (false, 'Ponctuelle') returning id)
insert into ids select 'ponctuelle', id from r;
set local role authenticated;
select throws_ok(
  format('select public.link_recipe_ingredient(%L, 1, %L, %L)', (select id from ids where name = 'tarte'), 'bananes', (select id from ids where name = 'ponctuelle')),
  'P0002', 'Recette liée introuvable', 'recette ponctuelle refusée'
);

select lives_ok(
  format('select public.link_recipe_ingredient(%L, 0, %L, null)', (select id from ids where name = 'tarte'), 'pâte sucrée'),
  'délier un ingrédient'
);
select public.link_recipe_ingredient((select id from ids where name = 'tarte'), 0, 'pâte sucrée', (select id from ids where name = 'pâte'));

-- Sous-recette utilisée : suppression refusée ; la recette principale, elle, peut être supprimée
select throws_ok(
  format('delete from public.recipes where id = %L', (select id from ids where name = 'pâte')),
  '23503', 'Recette utilisée par une autre recette', 'sous-recette utilisée : suppression refusée'
);
delete from public.recipes where id = (select id from ids where name = 'tarte');
select lives_ok(
  format('delete from public.recipes where id = %L', (select id from ids where name = 'pâte')),
  'sous-recette supprimable une fois la recette principale supprimée'
);

select * from finish();
rollback;
