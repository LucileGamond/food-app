begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Anonyme : aucun accès
set local role anon;
select throws_ok('select count(*) from public.weight_entries', '42501', null, 'anon ne lit pas les poids');
select throws_ok(
  $$select public.save_weigh_in('2026-10-01', '[{"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":60}]')$$,
  '42501', null, 'anon n''enregistre pas de poids'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Relevé pour deux personnes
select lives_ok(
  $$select public.save_weigh_in('2026-10-01', '[
      {"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":62.5},
      {"profile_id":"22222222-2222-2222-2222-222222222222","weight_kg":73.1}]')$$,
  'relevé enregistré'
);
select is((select count(*)::int from public.weight_entries where measured_on = '2026-10-01'), 2, 'une mesure par personne');

-- Même jour, même personne : la mesure est remplacée (une seule par jour)
select public.save_weigh_in('2026-10-01', '[{"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":62.0}]');
select is(
  (select weight_kg from public.weight_entries where measured_on = '2026-10-01' and profile_id = '11111111-1111-1111-1111-111111111111'),
  62.0::numeric, 'mesure du jour remplacée'
);
select is((select count(*)::int from public.weight_entries where measured_on = '2026-10-01'), 2, 'la mesure d''Eric est conservée');

-- Un poids null efface la mesure de la personne
select public.save_weigh_in('2026-10-01', '[
  {"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":62.0},
  {"profile_id":"22222222-2222-2222-2222-222222222222","weight_kg":null}]');
select is((select count(*)::int from public.weight_entries where measured_on = '2026-10-01'), 1, 'poids vide = mesure effacée');

-- Changement de date : la mesure est déplacée
select public.save_weigh_in('2026-10-03', '[{"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":61.8}]', '2026-10-01');
select is((select count(*)::int from public.weight_entries where measured_on = '2026-10-01'), 0, 'ancienne date libérée');
select is((select weight_kg from public.weight_entries where measured_on = '2026-10-03'), 61.8::numeric, 'mesure à la nouvelle date');

-- Validations
select throws_ok(
  $$select public.save_weigh_in('2026-10-05', '[{"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":null}]')$$,
  '22023', null, 'au moins un poids'
);
select throws_ok(
  $$select public.save_weigh_in('2026-10-05', '[]')$$, '22023', null, 'relevé vide refusé'
);
select throws_ok(
  $$select public.save_weigh_in('2026-10-05', '[{"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":12}]')$$,
  '23514', null, 'poids trop faible refusé'
);
select throws_ok(
  $$select public.save_weigh_in('2026-10-05', '[{"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":301}]')$$,
  '23514', null, 'poids trop élevé refusé'
);
select throws_ok(
  format($$select public.save_weigh_in(%L, '[{"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":60}]')$$, current_date + 5),
  '23514', null, 'date future refusée'
);
select throws_ok(
  $$select public.save_weigh_in('2026-10-05', '[{"profile_id":"33333333-3333-3333-3333-333333333333","weight_kg":60}]')$$,
  '23503', null, 'personne inconnue refusée'
);

-- Arrondi au dixième
select public.save_weigh_in('2026-10-06', '[{"profile_id":"11111111-1111-1111-1111-111111111111","weight_kg":61.24}]');
select is((select weight_kg from public.weight_entries where measured_on = '2026-10-06'), 61.2::numeric, 'poids arrondi au dixième');

select * from finish();
rollback;
