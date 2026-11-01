begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.planning_inbox;
delete from public.meals;
delete from public.recipes;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Listes et photos
select lives_ok($$select public.add_to_inbox('Curry vu sur Instagram', 'https://www.instagram.com/reel/abc/', p_list => 'aside')$$, 'lien mis de côté');
select lives_ok(
  $$select public.add_to_inbox('Tarte du livre', p_list => 'aside', p_photos => array['pending/1a2b3c4d-0000-4000-8000-000000000001.jpg', 'pending/1a2b3c4d-0000-4000-8000-000000000002.jpg'])$$,
  'photos mises de côté'
);
select lives_ok($$select public.add_to_inbox('Quiche du livre', p_photos => array['pending/1a2b3c4d-0000-4000-8000-000000000003.png'])$$, 'photos à planifier');
select results_eq(
  $$select list, cardinality(photos) from public.planning_inbox order by title$$,
  $$values ('aside', 0), ('plan', 1), ('aside', 2)$$,
  'chaque élément dans sa liste, avec ses photos'
);
select throws_ok($$select public.add_to_inbox('x', p_list => 'autre')$$, '22023', null, 'liste inconnue refusée');
select throws_ok($$select public.add_to_inbox('x', 'https://e.fr/a', p_photos => array['pending/1a2b3c4d-0000-4000-8000-000000000004.jpg'])$$, '22023', null, 'photos et lien refusés ensemble');
select throws_ok($$select public.add_to_inbox('x', p_photos => array['recettes/autre.jpg'])$$, '22023', null, 'photo hors attente refusée');
select throws_ok(
  $$select public.add_to_inbox('x', p_photos => array['pending/a.jpg', 'pending/b.jpg', 'pending/c.jpg', 'pending/d.jpg'])$$,
  '23514', null, '3 photos au plus'
);
select throws_ok($$select public.add_to_inbox('Curry bis', 'https://instagram.com/reel/abc', p_list => 'plan')$$, '23505', null, 'un lien n''est que dans une liste');

-- Déplacer d'une liste à l'autre
update public.planning_inbox set list = 'plan' where title = 'Curry vu sur Instagram';
select is((select list from public.planning_inbox where title = 'Curry vu sur Instagram'), 'plan', 'élément déplacé vers « À planifier »');

-- Planifier un élément avec photos : les pages deviennent les photos de la recette du repas
select public.plan_inbox_item(
  (select id from public.planning_inbox where title = 'Quiche du livre'), '2026-11-02', 'DINNER', array['11111111-1111-1111-1111-111111111111']::uuid[]
);
select results_eq(
  $$select r.title, r.is_saved, p.storage_path, p.position
    from public.meals m join public.recipes r on r.id = m.recipe_id join public.recipe_photos p on p.recipe_id = r.id$$,
  $$values ('Quiche du livre', false, 'pending/1a2b3c4d-0000-4000-8000-000000000003.png', 0)$$,
  'repas ponctuel avec la page du livre en photo'
);
select is((select count(*)::int from public.planning_inbox where title = 'Quiche du livre'), 0, 'élément planifié retiré');

-- Recette enregistrée depuis un élément
select public.save_recipe('Tarte du livre', '[{"name":"pommes"}]') as tarte \gset
select results_eq(
  format('select public.resolve_inbox_item(%L, %L)', (select id from public.planning_inbox where title = 'Tarte du livre'), :'tarte'),
  $$values (array['pending/1a2b3c4d-0000-4000-8000-000000000001.jpg', 'pending/1a2b3c4d-0000-4000-8000-000000000002.jpg'])$$,
  '« De côté » : photos renvoyées pour être retirées du stockage'
);
select is((select count(*)::int from public.planning_inbox where title = 'Tarte du livre'), 0, '« De côté » : élément retiré une fois enregistré');

select public.save_recipe('Curry coco', '[{"name":"lait de coco"}]') as curry \gset
select public.resolve_inbox_item((select id from public.planning_inbox where title = 'Curry vu sur Instagram'), :'curry');
select results_eq(
  $$select title, url, recipe_id is not null, list from public.planning_inbox$$,
  $$values ('Curry coco', null::text, true, 'plan')$$,
  '« À planifier » : l''élément devient la recette enregistrée'
);
select is(public.resolve_inbox_item(gen_random_uuid(), :'curry'), '{}'::text[], 'élément déjà traité : rien à faire');

select * from finish();
rollback;
