begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.user_settings;
delete from public.water_intakes;
delete from public.push_subscriptions;

set local role anon;
select throws_ok('select count(*) from public.user_settings', '42501', null, 'anon ne lit pas les réglages');
select throws_ok('select count(*) from public.water_intakes', '42501', null, 'anon ne lit pas les verres');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Réglages
insert into public.user_settings default values;
select is(
  (select disabled_pages from public.user_settings), '{hydratation}'::text[], 'suivi d''hydratation désactivé par défaut'
);
select is((select hydration_goal_ml from public.user_settings), 1500, 'objectif de 1,5 L par défaut');
select throws_ok(
  $$update public.user_settings set disabled_pages = '{inconnue}'$$, '23514', null, 'page inconnue refusée'
);
select throws_ok(
  $$update public.user_settings set muted_notifications = '{poids}'$$, '23514', null, 'notification inconnue refusée'
);
select throws_ok(
  $$update public.user_settings set hydration_goal_ml = 100$$, '23514', null, 'objectif trop petit refusé'
);
select throws_ok(
  $$update public.user_settings set hydration_reminded_at = now()$$, '42501', null, 'date du rappel réservée au serveur'
);
update public.user_settings set disabled_pages = '{}';

-- Verres
select throws_ok(
  $$insert into public.water_intakes (volume_ml) values (0)$$, '23514', null, 'volume nul refusé'
);
-- 10 h à Paris le 10 novembre (UTC+1)
insert into public.water_intakes (volume_ml, drunk_at) values (200, '2026-11-10T09:00:00Z');
select is((select count(*)::int from public.water_intakes), 1, 'verre enregistré');

select throws_ok(
  $$select * from public.claim_hydration_reminders()$$, '42501', null, 'rappels réservés au serveur'
);

-- Eric ne voit ni les réglages ni les verres de Lucile
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.water_intakes), 0, 'verres de l''autre invisibles');
select is((select count(*)::int from public.user_settings), 0, 'réglages de l''autre invisibles');
select throws_ok(
  $$insert into public.water_intakes (profile_id, volume_ml) values ('11111111-1111-1111-1111-111111111111', 200)$$,
  '42501', null, 'pas de verre pour l''autre'
);

-- Rappels (calculés côté serveur)
reset role;
select is(
  (select count(*)::int from public.hydration_reminders_due('2026-11-10T13:00:00Z')), 0, 'pas de rappel sans appareil abonné'
);
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values ('11111111-1111-1111-1111-111111111111', 'https://push.test/lucile', 'k', 'a');

select is(
  (select count(*)::int from public.hydration_reminders_due('2026-11-10T12:59:00Z')), 0, 'moins de 4 h après le dernier verre'
);
select results_eq(
  $$select drunk_ml, goal_ml from public.hydration_reminders_due('2026-11-10T13:00:00Z')$$,
  $$values (200, 1500)$$,
  '4 h après le dernier verre : rappel, avec la quantité du jour'
);
select is(
  (select count(*)::int from public.claim_hydration_reminders('2026-11-10T13:00:00Z')), 1, 'rappel réservé'
);
select is(
  (select count(*)::int from public.claim_hydration_reminders('2026-11-10T13:05:00Z')), 0, 'pas deux fois le même rappel'
);
select is(
  (select count(*)::int from public.hydration_reminders_due('2026-11-10T17:00:00Z')), 1, 'nouveau rappel 4 h après le précédent'
);
select is(
  (select count(*)::int from public.hydration_reminders_due('2026-11-10T22:10:00Z')), 0, 'pas de rappel après 23 h'
);
-- Lendemain : rien bu, premier rappel à 13 h (4 h après 9 h)
select is(
  (select count(*)::int from public.hydration_reminders_due('2026-11-11T11:50:00Z')), 0, 'pas de rappel avant 13 h sans verre'
);

insert into public.water_intakes (profile_id, volume_ml, drunk_at)
values ('11111111-1111-1111-1111-111111111111', 1300, '2026-11-10T14:00:00Z');
select is(
  (select count(*)::int from public.hydration_reminders_due('2026-11-10T19:00:00Z')), 0, 'objectif atteint : plus de rappel'
);

delete from public.water_intakes where volume_ml = 1300;
update public.user_settings set muted_notifications = '{hydratation}';
select is(
  (select count(*)::int from public.hydration_reminders_due('2026-11-10T19:00:00Z')), 0, 'notifications coupées : pas de rappel'
);

select * from finish();
rollback;
