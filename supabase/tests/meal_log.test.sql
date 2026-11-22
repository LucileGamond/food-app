begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.meal_log;
delete from public.user_settings;
delete from public.push_subscriptions;
delete from public.food_periods;
delete from public.food_plan_items;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.meal_log', '42501', null, 'anon ne lit pas le journal');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok($$insert into public.meal_log (profile_id, eaten_on, slot, kind) values
  ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'LUNCH', 'vegetarian'),
  ('22222222-2222-2222-2222-222222222222', '2026-11-16', 'LUNCH', 'meat')$$, 'chacun note pour soi et pour l''autre (journal partagé)');
select throws_ok($$insert into public.meal_log (profile_id, eaten_on, slot, kind) values ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'LUNCH', 'meat')$$,
  '23505', null, 'une seule réponse par moment');
select throws_ok($$insert into public.meal_log (profile_id, eaten_on, slot, kind) values ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'SNACK', 'meat')$$,
  '23514', null, 'moment inconnu refusé');
select throws_ok($$insert into public.meal_log (profile_id, eaten_on, slot, kind) values ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'DINNER', 'vegan')$$,
  '23514', null, 'réponse inconnue refusée');
select lives_ok($$update public.meal_log set kind = 'skipped' where slot = 'LUNCH' and profile_id = '22222222-2222-2222-2222-222222222222'$$, 'réponse modifiable');
select is((select count(*)::int from public.meal_log), 2, 'les deux réponses sont lisibles');
select lives_ok($$update public.user_settings set muted_notifications = '{repas}'$$, 'rappel des repas coupable');
select throws_ok($$update public.user_settings set meals_reminded_on = current_date$$, '42501', null, 'date du rappel réservée au serveur');
select throws_ok($$select * from public.claim_meal_reminders()$$, '42501', null, 'rappel réservé au serveur');
select throws_ok($$select * from public.meal_reminders_due()$$, '42501', null, 'liste des rappels réservée au serveur');
reset role;
delete from public.meal_log;

-- ---------------------------------------------------------------------------
-- Rappel du soir (serveur). 16 novembre, Paris = UTC+1 : 21 h = 20:00Z
-- ---------------------------------------------------------------------------
insert into public.user_settings (profile_id, hydration_goal_ml, disabled_pages, muted_notifications)
values ('11111111-1111-1111-1111-111111111111', 1500, '{}', '{}');
select is((select count(*)::int from public.meal_reminders_due('2026-11-16T20:10:00Z')), 0, 'pas de rappel sans appareil abonné');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values ('11111111-1111-1111-1111-111111111111', 'https://push.test/lucile', 'k', 'a');
select is((select count(*)::int from public.meal_reminders_due('2026-11-16T19:59:00Z')), 0, 'pas de rappel avant 21 h (heure de Paris)');
select is(
  (select row(missing, plan_empty)::text from public.meal_reminders_due('2026-11-16T20:10:00Z')),
  row(3, false)::text,
  'rien noté, sans période : les trois repas'
);

insert into public.meal_log (profile_id, eaten_on, slot, kind) values
  ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'BREAKFAST', 'skipped'),
  ('11111111-1111-1111-1111-111111111111', '2026-11-15', 'LUNCH', 'meat'),
  ('22222222-2222-2222-2222-222222222222', '2026-11-16', 'LUNCH', 'meat');
select is((select missing from public.meal_reminders_due('2026-11-16T20:10:00Z')), 2, 'seules les réponses du jour de la personne comptent');

-- Période en cours sans rien de noté aujourd'hui
insert into public.food_plan_items (profile_id, meal, category, name, quantity, unit, allowed_occurrences, position)
values ('11111111-1111-1111-1111-111111111111', 'LUNCH', 'Autres', 'Yaourt', null, null, 1, 0);
select public.create_food_period('11111111-1111-1111-1111-111111111111', '2026-11-10', '2026-11-23');
select is((select plan_empty from public.meal_reminders_due('2026-11-16T20:10:00Z')), true, 'période en cours vide aujourd''hui');
insert into public.food_consumptions (item_id, consumed_on)
select i.id, '2026-11-15' from public.food_period_items i;
select is((select plan_empty from public.meal_reminders_due('2026-11-16T20:10:00Z')), true, 'une consommation de la veille ne compte pas');
insert into public.food_consumptions (item_id, consumed_on)
select i.id, '2026-11-16' from public.food_period_items i;
select is((select plan_empty from public.meal_reminders_due('2026-11-16T20:10:00Z')), false, 'consommation notée aujourd''hui');

insert into public.meal_log (profile_id, eaten_on, slot, kind) values
  ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'LUNCH', 'vegetarian'),
  ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'DINNER', 'meat');
select is((select count(*)::int from public.meal_reminders_due('2026-11-16T20:10:00Z')), 0, 'tout rempli : pas de rappel');

-- Lendemain : réservation une fois par jour
select is(
  (select row(profile_id, missing, plan_empty)::text from public.claim_meal_reminders('2026-11-17T20:15:00Z')),
  row('11111111-1111-1111-1111-111111111111'::uuid, 3, true)::text,
  'rappel du lendemain réservé à 21 h 15'
);
select is((select count(*)::int from public.claim_meal_reminders('2026-11-17T21:15:00Z')), 0, 'un seul rappel par jour');

update public.user_settings set muted_notifications = '{repas}';
select is((select count(*)::int from public.meal_reminders_due('2026-11-18T20:15:00Z')), 0, 'rappel coupé dans les réglages');
update public.user_settings set muted_notifications = '{}', disabled_pages = '{plan}';
select is(
  (select row(missing, plan_empty)::text from public.meal_reminders_due('2026-11-18T20:15:00Z')),
  row(3, false)::text,
  'page Plan masquée : le journal seulement'
);
update public.user_settings set disabled_pages = '{vege}';
select is((select count(*)::int from public.meal_reminders_due('2026-11-18T20:15:00Z')), 0, 'page Végé masquée : pas de rappel');
select lives_ok($$update public.user_settings set disabled_pages = '{vege,plan}'$$, 'pages Végé et Plan masquables');

select ok(exists (select 1 from cron.job where jobname = 'notify-meals'), 'rappel du soir planifié');

select * from finish();
rollback;
