begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.plants;
delete from public.user_settings;
delete from public.push_subscriptions;

-- ---------------------------------------------------------------------------
-- Anonyme : aucun accès
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.plants', '42501', null, 'anon ne lit pas les plantes');
select throws_ok('select count(*) from public.watering_rules', '42501', null, 'anon ne lit pas les règles');
select throws_ok('select count(*) from public.watering_events', '42501', null, 'anon ne lit pas les arrosages');
select throws_ok($$select public.replace_watering_rules(gen_random_uuid(), '[]')$$, '42501', null, 'anon ne modifie pas les règles');
reset role;

-- ---------------------------------------------------------------------------
-- Connectée en Lucile
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

with p as (
  insert into public.plants (name, species, location, planted_on, planted_height_cm)
  values ('Cactus', 'Echinocactus grusonii', 'Salon', '2026-04-01', 12.5)
  returning id
)
insert into ids select 'cactus', id from p;

select is((select created_by from public.plants where id = (select v from ids where k = 'cactus')),
  '11111111-1111-1111-1111-111111111111'::uuid, 'created_by = personne connectée');
select throws_ok($$insert into public.plants (name) values ('   ')$$, '23514', null, 'nom vide refusé');
select throws_ok($$insert into public.plants (name, planted_height_cm) values ('Ficus', 0)$$, '23514', null, 'taille nulle refusée');
select throws_ok($$insert into public.plants (name, pot_diameter_cm) values ('Ficus', -3)$$, '23514', null, 'diamètre négatif refusé');

-- Photos : rangées dans le dossier de leur plante
select throws_ok(
  format($$insert into public.plant_photos (plant_id, storage_path, position) values (%L, 'autre/photo.jpg', 0)$$, (select v from ids where k = 'cactus')),
  '23514', null, 'photo hors du dossier de la plante refusée'
);
select lives_ok(
  format($$insert into public.plant_photos (plant_id, storage_path, position) values (%L, %L, 0)$$,
    (select v from ids where k = 'cactus'), (select v from ids where k = 'cactus')::text || '/photo.jpg'),
  'photo dans le dossier de la plante'
);

-- Règles d'arrosage : validité des mois et du 1er arrosage
select lives_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{6,7,8}', '2026-06-05', 1, 'month', 1000)$$, (select v from ids where k = 'cactus')),
  'règle d''été acceptée'
);
select lives_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{11,12,1,2}', '2026-11-15', 6, 'week', 200)$$, (select v from ids where k = 'cactus')),
  'règle d''hiver à cheval sur deux années acceptée'
);
select throws_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{8,9}', '2026-09-01', 1, 'week', 100)$$, (select v from ids where k = 'cactus')),
  '23P01', null, 'chevauchement de mois refusé'
);
select throws_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{3,5}', '2026-03-01', 1, 'week', 100)$$, (select v from ids where k = 'cactus')),
  '23514', null, 'mois non consécutifs refusés'
);
select throws_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{}', '2026-03-01', 1, 'week', 100)$$, (select v from ids where k = 'cactus')),
  '23514', null, 'aucun mois refusé'
);
select throws_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{3,3}', '2026-03-01', 1, 'week', 100)$$, (select v from ids where k = 'cactus')),
  '23514', null, 'mois en double refusés'
);
select throws_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{13}', '2026-03-01', 1, 'week', 100)$$, (select v from ids where k = 'cactus')),
  '23514', null, 'mois 13 refusé'
);
select throws_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{3,4}', '2026-05-01', 1, 'week', 100)$$, (select v from ids where k = 'cactus')),
  '23514', null, '1er arrosage hors des mois choisis refusé'
);
select throws_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{3}', '2026-03-01', 0, 'week', 100)$$, (select v from ids where k = 'cactus')),
  '23514', null, 'fréquence nulle refusée'
);
select throws_ok(
  format($$insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml)
           values (%L, '{3}', '2026-03-01', 1, 'week', 0)$$, (select v from ids where k = 'cactus')),
  '23514', null, 'quantité nulle refusée'
);
select ok(public.months_are_valid('{1,2,3,4,5,6,7,8,9,10,11,12}'), 'toute l''année valide');

-- Remplacement des règles en bloc
select lives_ok(
  format($$select public.replace_watering_rules(%L, '[{"months":[4,5,6,7,8,9],"first_watering_on":"2026-04-10","interval_count":2,"interval_unit":"week","amount_ml":500,"note":"  "}]')$$,
    (select v from ids where k = 'cactus')),
  'remplacement des règles'
);
select results_eq(
  format('select months::int[], amount_ml, note from public.watering_rules where plant_id = %L', (select v from ids where k = 'cactus')),
  $$values (array[4,5,6,7,8,9], 500, null::text)$$,
  'anciennes règles remplacées, note vide → null'
);
select throws_ok(
  format($$select public.replace_watering_rules(%L, '[{"months":[4],"first_watering_on":"2026-04-10","interval_count":1,"interval_unit":"week","amount_ml":500},{"months":[4,5],"first_watering_on":"2026-04-10","interval_count":1,"interval_unit":"week","amount_ml":500}]')$$,
    (select v from ids where k = 'cactus')),
  '23P01', null, 'remplacement refusé si chevauchement'
);
select is(
  (select count(*)::int from public.watering_rules where plant_id = (select v from ids where k = 'cactus')),
  1, 'échec du remplacement : règles inchangées'
);
select throws_ok($$select public.replace_watering_rules(gen_random_uuid(), '[]')$$, 'P0002', null, 'plante inconnue');
select throws_ok(
  format($$select public.replace_watering_rules(%L, '{}')$$, (select v from ids where k = 'cactus')),
  '22023', null, 'règles qui ne sont pas une liste refusées'
);

-- Création / mise à jour d'une plante avec ses règles, en une transaction
insert into ids values ('ficus', public.save_plant(
  '{"name":"  Ficus  ","species":"","location":"Bureau","planted_on":"2026-03-01","planted_height_cm":40,"pot_diameter_cm":null,"notes":" "}',
  '[{"months":[1,2,3,4,5,6,7,8,9,10,11,12],"first_watering_on":"2026-03-01","interval_count":10,"interval_unit":"day","amount_ml":300}]'
));
select results_eq(
  format('select name, species, location, notes from public.plants where id = %L', (select v from ids where k = 'ficus')),
  $$values ('Ficus', null::text, 'Bureau', null::text)$$,
  'plante créée, textes nettoyés'
);
select throws_ok(
  format($$select public.save_plant('{"name":"Ficus 2"}', '[{"months":[3],"first_watering_on":"2026-04-01","interval_count":1,"interval_unit":"week","amount_ml":1}]', %L)$$,
    (select v from ids where k = 'ficus')),
  '23514', null, 'règle invalide : rien n''est enregistré'
);
select is((select name from public.plants where id = (select v from ids where k = 'ficus')), 'Ficus', 'nom inchangé après l''échec');
select lives_ok(
  format($$select public.save_plant('{"name":"Ficus elastica"}', '[]', %L)$$, (select v from ids where k = 'ficus')),
  'mise à jour sans règle'
);
select is((select count(*)::int from public.watering_rules where plant_id = (select v from ids where k = 'ficus')), 0, 'règles supprimées');
select throws_ok($$select public.save_plant('{"name":"X"}', '[]', gen_random_uuid())$$, 'P0002', null, 'mise à jour d''une plante inconnue');

-- Arrosages : l'auteur est toujours la personne connectée
insert into public.watering_events (plant_id, scheduled_on, amount_ml, done_by)
values ((select v from ids where k = 'cactus'), '2026-10-22', 500, '22222222-2222-2222-2222-222222222222');
select is(
  (select done_by from public.watering_events where scheduled_on = '2026-10-22'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'done_by forcé sur la personne connectée'
);
select throws_ok(
  format($$insert into public.watering_events (plant_id, scheduled_on) values (%L, '2026-10-22')$$, (select v from ids where k = 'cactus')),
  '23505', null, 'une échéance ne peut être arrosée qu''une fois'
);
select lives_ok(
  format($$insert into public.watering_events (plant_id) values (%L), (%L)$$, (select v from ids where k = 'cactus'), (select v from ids where k = 'cactus')),
  'plusieurs arrosages hors planning possibles'
);
select throws_ok($$update public.watering_events set amount_ml = 1$$, '42501', null, 'un arrosage ne se modifie pas');

-- Réglages : page masquée par défaut, rappels réservés au serveur
insert into public.user_settings default values;
select ok((select 'plantes' = any (disabled_pages) from public.user_settings), 'page Plantes masquée par défaut');
select throws_ok(
  $$update public.user_settings set plants_reminded_on = current_date$$, '42501', null, 'date du rappel réservée au serveur'
);
select throws_ok($$select * from public.claim_plant_reminders()$$, '42501', null, 'rappels réservés au serveur');

-- ---------------------------------------------------------------------------
-- Connecté en Eric : plantes partagées par le foyer
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.plants), 2, 'Eric voit les plantes du foyer');
select is((select count(*)::int from public.watering_events), 3, 'Eric voit qui a arrosé');

delete from public.plants where id = (select v from ids where k = 'cactus');
select is(
  (select count(*)::int from public.watering_rules) + (select count(*)::int from public.watering_events) + (select count(*)::int from public.plant_photos),
  0, 'suppression en cascade (règles, arrosages, photos)'
);
reset role;

-- ---------------------------------------------------------------------------
-- Rappels du matin (serveur)
-- ---------------------------------------------------------------------------
update public.user_settings set disabled_pages = '{}' where profile_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.plant_reminders_due('2026-11-10T08:00:00Z')), 0, 'pas de rappel sans appareil abonné'
);
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values ('11111111-1111-1111-1111-111111111111', 'https://push.test/lucile', 'k', 'a');
-- 10 novembre, Paris = UTC+1
select is(
  (select count(*)::int from public.plant_reminders_due('2026-11-10T06:59:00Z')), 0, 'pas de rappel avant 8 h (heure de Paris)'
);
select is(
  (select count(*)::int from public.claim_plant_reminders('2026-11-10T07:05:00Z')), 1, 'rappel du jour réservé à 8 h 05'
);
select is(
  (select count(*)::int from public.claim_plant_reminders('2026-11-10T15:05:00Z')), 0, 'un seul rappel par jour'
);
select is(
  (select count(*)::int from public.plant_reminders_due('2026-11-11T07:05:00Z')), 1, 'nouveau rappel le lendemain'
);
update public.user_settings set muted_notifications = '{plantes}';
select is(
  (select count(*)::int from public.plant_reminders_due('2026-11-11T07:05:00Z')), 0, 'rappels coupés dans les réglages'
);

select ok(exists (select 1 from storage.buckets where id = 'plant-photos' and not public), 'bucket photos privé');
select ok(exists (select 1 from cron.job where jobname = 'notify-plants'), 'rappel planifié');

select * from finish();
rollback;
