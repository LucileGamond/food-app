begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.plants;
delete from public.user_settings;
delete from public.push_subscriptions;
delete from public.water_intakes;
delete from public.notification_actions;
delete from public.shopping_lists;
delete from public.meals;
delete from public.recipes;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Contenants d'eau
-- ---------------------------------------------------------------------------
select ok(public.hydration_containers_are_valid('[{"name": "Gourde", "ml": 750}]'), 'un contenant valide');
select ok(not public.hydration_containers_are_valid('[]'), 'au moins un contenant');
select ok(not public.hydration_containers_are_valid('[{"name":"a","ml":100},{"name":"b","ml":100},{"name":"c","ml":100},{"name":"d","ml":100},{"name":"e","ml":100}]'), '4 contenants au plus');
select ok(not public.hydration_containers_are_valid('[{"name": "  ", "ml": 200}]'), 'nom requis');
select ok(not public.hydration_containers_are_valid('[{"name": "Une très très longue gourde", "ml": 200}]'), 'nom de 20 caractères au plus');
select ok(not public.hydration_containers_are_valid('[{"name": "Seau", "ml": 10000}]'), 'volume borné');
select ok(not public.hydration_containers_are_valid('[{"name": "Verre", "ml": 20.5}]'), 'volume entier');
select ok(not public.hydration_containers_are_valid('[{"name": "Verre", "ml": "200"}]'), 'volume numérique');
select ok(not public.hydration_containers_are_valid('{"name": "Verre", "ml": 200}'), 'une liste');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.user_settings (disabled_pages) values ('{}');
select is((select hydration_containers from public.user_settings),
  '[{"name": "Petit verre", "ml": 200}, {"name": "Grand verre", "ml": 330}]'::jsonb, 'contenants par défaut');
update public.user_settings set hydration_containers = '[{"name": "Gourde", "ml": 750}, {"name": "Tasse", "ml": 250}]';
select is((select hydration_containers -> 0 ->> 'name' from public.user_settings), 'Gourde', 'chacun règle ses contenants');
select throws_ok($$update public.user_settings set hydration_containers = '[]'$$, '23514', null, 'contenants invalides refusés');
reset role;

-- Le rappel d'hydratation donne les contenants (boutons de la notification).
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values ('11111111-1111-1111-1111-111111111111', 'https://push.exemple/l', 'k', 'a');
select is(
  (select containers -> 1 ->> 'name' from public.claim_hydration_reminders('2026-11-10T13:00:00Z')), 'Tasse', 'rappel avec les contenants'
);

-- ---------------------------------------------------------------------------
-- 2. Boutons des notifications
-- ---------------------------------------------------------------------------
set local role authenticated;
select throws_ok($$select public.create_notification_action('11111111-1111-1111-1111-111111111111', 'water', '{}')$$, '42501', null, 'jetons créés par le serveur seulement');
select throws_ok('select count(*) from public.notification_actions', '42501', null, 'jetons illisibles');
reset role;

insert into ids values ('water', public.create_notification_action('11111111-1111-1111-1111-111111111111', 'water', '{"volumes": [750, 250]}'));
insert into public.notification_actions (token, profile_id, kind, payload, expires_at)
values ('00000000-0000-0000-0000-00000000dead', '11111111-1111-1111-1111-111111111111', 'water', '{"volumes": [200]}', now() - interval '1 minute');

-- Le service worker appelle sans session, avec la clé publique.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.run_notification_action(gen_random_uuid(), 'drink:250')$$, 'P0002', null, 'jeton inconnu');
select throws_ok($$select public.run_notification_action('00000000-0000-0000-0000-00000000dead', 'drink:200')$$, 'P0002', null, 'jeton expiré');
select throws_ok(format($$select public.run_notification_action(%L, 'drink:1000')$$, (select v from ids where k = 'water')), '22023', null, 'contenant non proposé');
select throws_ok(format($$select public.run_notification_action(%L, 'watered')$$, (select v from ids where k = 'water')), '22023', null, 'action d''un autre rappel');
select is(
  public.run_notification_action((select v from ids where k = 'water'), 'drink:250'),
  '{"kind": "water", "volume_ml": 250, "drunk_ml": 250, "goal_ml": 1500}'::jsonb,
  'verre noté depuis la notification'
);
select throws_ok(format($$select public.run_notification_action(%L, 'drink:250')$$, (select v from ids where k = 'water')), '55000', null, 'une seule fois');
reset role;
select is((select profile_id from public.water_intakes), '11111111-1111-1111-1111-111111111111'::uuid, 'verre de la bonne personne');

-- Création d'un jeton : les expirés sont supprimés.
select public.create_notification_action('11111111-1111-1111-1111-111111111111', 'water', '{"volumes": [200]}');
select ok(not exists (select 1 from public.notification_actions where token = '00000000-0000-0000-0000-00000000dead'), 'jetons expirés supprimés');

-- Arrosage : les plantes de la notification, au nom d'Eric ; une échéance déjà notée est ignorée.
insert into public.plants (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Ficus', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'Cactus', '11111111-1111-1111-1111-111111111111');
insert into public.watering_rules (id, plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
values ('bbbbbbbb-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', '{1,2,3,4,5,6,7,8,9,10,11,12}', '2026-01-01', 1, 'week', 250);
insert into public.watering_events (plant_id, scheduled_on, done_by)
values ('aaaaaaaa-0000-0000-0000-00000000000b', '2026-11-10', '11111111-1111-1111-1111-111111111111');
insert into ids values ('plants', public.create_notification_action('22222222-2222-2222-2222-222222222222', 'plants', jsonb_build_object('waterings', jsonb_build_array(
  jsonb_build_object('plant_id', 'aaaaaaaa-0000-0000-0000-00000000000a', 'rule_id', 'bbbbbbbb-0000-0000-0000-00000000000a', 'scheduled_on', '2026-11-10', 'amount_ml', 250),
  jsonb_build_object('plant_id', 'aaaaaaaa-0000-0000-0000-00000000000b', 'rule_id', null, 'scheduled_on', '2026-11-10', 'amount_ml', 100),
  jsonb_build_object('plant_id', gen_random_uuid(), 'rule_id', null, 'scheduled_on', '2026-11-10', 'amount_ml', 100)
))));

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(public.run_notification_action((select v from ids where k = 'plants'), 'watered'), '{"kind": "plants", "count": 1}'::jsonb, 'plantes arrosées depuis la notification');
reset role;
select is(
  (select row(done_by, rule_id, amount_ml)::text from public.watering_events where plant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  row('22222222-2222-2222-2222-222222222222'::uuid, 'bbbbbbbb-0000-0000-0000-00000000000a'::uuid, 250)::text,
  'arrosage noté au nom de la personne de la notification'
);

-- ---------------------------------------------------------------------------
-- 3. Ce que l'autre a fait
-- ---------------------------------------------------------------------------
insert into public.shopping_lists (id, name, created_by) values ('cccccccc-0000-0000-0000-00000000000c', 'Courses', '22222222-2222-2222-2222-222222222222');
insert into public.recipes (id, title, is_saved, created_by) values ('dddddddd-0000-0000-0000-00000000000d', 'Tarte', true, '22222222-2222-2222-2222-222222222222');

-- Eric ajoute un article, Lucile en coche un.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into public.shopping_items (list_id, name) values ('cccccccc-0000-0000-0000-00000000000c', 'Lait');
select public.create_meal(current_date + 1, 'LUNCH', array['22222222-2222-2222-2222-222222222222']::uuid[], 'dddddddd-0000-0000-0000-00000000000d', null);
select is((select count(*)::int from public.recent_activity()), 3, 'Eric ne voit que les gestes des autres (plantes de Lucile, arrosage du cactus)');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update public.shopping_items set checked = true where name = 'Lait';

select set_eq(
  $$select kind, actor_name, title, detail, target_id from public.recent_activity()$$,
  $$values
    ('watered', 'Eric', 'Ficus', null, 'aaaaaaaa-0000-0000-0000-00000000000a'::uuid),
    ('recipe_added', 'Eric', 'Tarte', null, 'dddddddd-0000-0000-0000-00000000000d'::uuid),
    ('planned', 'Eric', 'Tarte', (current_date + 1)::text || ' LUNCH', 'dddddddd-0000-0000-0000-00000000000d'::uuid),
    ('shopping_added', 'Eric', 'Lait', 'Courses', 'cccccccc-0000-0000-0000-00000000000c'::uuid)$$,
  'Lucile voit les gestes d’Eric, pas les siens'
);
select is((select count(*)::int from public.recent_activity(now() + interval '1 minute')), 0, 'depuis une date');
select is((select array_agg(at) from public.recent_activity()), (select array_agg(at order by at desc) from public.recent_activity()), 'du plus récent au plus ancien');
reset role;

set local role anon;
select throws_ok('select * from public.recent_activity()', '42501', null, 'anon ne voit pas l’activité');
reset role;
-- Sans personne connectée (clé de service) : rien.
set local request.jwt.claims = '{"role":"service_role"}';
select is((select count(*)::int from public.recent_activity()), 0, 'sans personne connectée, rien');

select * from finish();
rollback;
