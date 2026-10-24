begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.food_periods;
delete from public.food_plan_items;

-- Anonyme : aucun accès
set local role anon;
select throws_ok('select count(*) from public.food_plan_items', '42501', null, 'anon ne lit pas le plan');
select throws_ok('select count(*) from public.food_consumptions', '42501', null, 'anon ne lit pas les consommations');
select throws_ok(
  $$select public.create_food_period('11111111-1111-1111-1111-111111111111', '2026-10-19', '2026-11-02')$$,
  '42501', null, 'anon ne crée pas de période'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Plan vide : pas de période
select throws_ok(
  $$select public.create_food_period('11111111-1111-1111-1111-111111111111', '2026-10-19', '2026-11-02')$$,
  '22023', null, 'période refusée tant que le plan est vide'
);

-- Plan
insert into public.food_plan_items (profile_id, meal, category, name, quantity, unit, allowed_occurrences, position) values
  ('11111111-1111-1111-1111-111111111111', 'LUNCH', 'Produit laitier', 'Yaourt', 125, 'g', 2, 10),
  ('11111111-1111-1111-1111-111111111111', 'DINNER', 'Produit laitier', 'Yaourt', 125, 'g', 3, 20),
  ('11111111-1111-1111-1111-111111111111', 'SPORT', 'Sport', 'Renforcement', 10, 'min', 4, 30);
select is((select count(*)::int from public.food_plan_items), 3, 'même aliment autorisé dans deux moments');

select throws_ok(
  $$insert into public.food_plan_items (profile_id, meal, category, name, allowed_occurrences)
    values ('11111111-1111-1111-1111-111111111111', 'LUNCH', 'Autres', 'Yaourt', 1)$$,
  '23505', null, 'doublon refusé dans un même moment'
);
select throws_ok(
  $$insert into public.food_plan_items (profile_id, meal, category, name, allowed_occurrences)
    values ('11111111-1111-1111-1111-111111111111', 'LUNCH', 'Autres', 'Ketchup', 0)$$,
  '23514', null, 'quota nul refusé'
);
select throws_ok(
  $$insert into public.food_plan_items (profile_id, meal, category, name, allowed_occurrences)
    values ('11111111-1111-1111-1111-111111111111', 'LUNCH', ' ', 'Ketchup', 1)$$,
  '23514', null, 'catégorie vide refusée'
);
select throws_ok(
  $$insert into public.food_plan_items (profile_id, meal, category, name, quantity, allowed_occurrences)
    values ('11111111-1111-1111-1111-111111111111', 'LUNCH', 'Autres', 'Ketchup', -5, 1)$$,
  '23514', null, 'quantité négative refusée'
);

-- Création d'une période : copie du plan
select lives_ok(
  $$select public.create_food_period('11111111-1111-1111-1111-111111111111', '2026-10-19', '2026-11-02')$$,
  'période créée'
);
select is(
  (select count(*)::int from public.food_period_items i join public.food_periods p on p.id = i.period_id
   where p.profile_id = '11111111-1111-1111-1111-111111111111'),
  3, 'le plan est copié dans la période'
);

-- La période est figée : modifier le plan ne la change pas
update public.food_plan_items set allowed_occurrences = 9 where meal = 'LUNCH';
select is((select allowed_occurrences from public.food_period_items where meal = 'LUNCH'), 2, 'quota de la période figé');

-- Chevauchement interdit pour une même personne, permis entre personnes
select throws_ok(
  $$select public.create_food_period('11111111-1111-1111-1111-111111111111', '2026-11-02', '2026-11-10')$$,
  '23P01', null, 'chevauchement refusé (dates incluses)'
);
insert into public.food_plan_items (profile_id, meal, category, name, allowed_occurrences)
  values ('22222222-2222-2222-2222-222222222222', 'LUNCH', 'Autres', 'Pain', 3);
select lives_ok(
  $$select public.create_food_period('22222222-2222-2222-2222-222222222222', '2026-10-20', '2026-11-03')$$,
  'chaque personne a ses propres périodes'
);
select throws_ok(
  $$insert into public.food_periods (profile_id, start_date, end_date)
    values ('11111111-1111-1111-1111-111111111111', '2026-12-10', '2026-12-01')$$,
  '23514', null, 'fin avant le début refusée'
);

-- Consommations : plusieurs le même jour, dans la période uniquement
insert into public.food_consumptions (item_id, consumed_on)
select id, d from public.food_period_items, (values ('2026-10-19'::date), ('2026-10-19'), ('2026-11-02')) v(d) where meal = 'LUNCH' and name = 'Yaourt';
select is((select count(*)::int from public.food_consumptions), 3, 'plusieurs consommations le même jour (au-delà du quota)');
select is(
  (select created_by from public.food_consumptions limit 1),
  '11111111-1111-1111-1111-111111111111'::uuid, 'auteur renseigné'
);
select throws_ok(
  $$insert into public.food_consumptions (item_id, consumed_on)
    select id, '2026-11-03' from public.food_period_items where meal = 'LUNCH' and name = 'Yaourt'$$,
  '23514', null, 'date hors période refusée'
);
select throws_ok(
  $$update public.food_consumptions set consumed_on = '2026-10-18'$$,
  '23514', null, 'déplacement hors période refusé'
);

-- Supprimer une période supprime ses éléments et consommations
delete from public.food_periods where profile_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.food_consumptions) + (select count(*)::int from public.food_period_items where name <> 'Pain'),
  0, 'suppression en cascade'
);

select * from finish();
rollback;
