begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.calendar_sources;
delete from public.user_settings;
delete from public.push_subscriptions;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Anonyme : aucun accès
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.calendar_sources', '42501', null, 'anon ne lit pas les agendas');
select throws_ok('select count(*) from public.calendar_events', '42501', null, 'anon ne lit pas les événements');
select throws_ok('select count(*) from public.calendar_source_credentials', '42501', null, 'anon ne lit pas les adresses');
select throws_ok($$select public.add_ical_calendar('Perso', 'https://calendar.google.com/calendar/ical/a/private-b/basic.ics')$$, '42501', null, 'anon n''ajoute pas d''agenda');
reset role;

-- ---------------------------------------------------------------------------
-- Connectée en Lucile : ajout par son adresse iCal
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into ids select 'perso', public.add_ical_calendar('  Perso ', 'https://calendar.google.com/calendar/ical/lucile%40gmail.com/private-abc/basic.ics');
select is(
  (select row(owner_id, provider, name, last_synced_at, last_error)::text from public.calendar_sources where id = (select v from ids where k = 'perso')),
  row('11111111-1111-1111-1111-111111111111'::uuid, 'ical', 'Perso', null::timestamptz, null::text)::text,
  'source ajoutée au nom de la personne connectée, en attente de synchronisation'
);
select throws_ok($$select public.add_ical_calendar('Pirate', 'https://evil.test/calendar/ical/a/private-b/basic.ics')$$, '23514', null, 'adresse hors Google refusée');
select throws_ok($$select public.add_ical_calendar('Pirate', 'http://calendar.google.com/calendar/ical/a/private-b/basic.ics')$$, '23514', null, 'adresse non chiffrée refusée');
select throws_ok($$select public.add_ical_calendar('   ', 'https://calendar.google.com/calendar/ical/a/private-b/basic.ics')$$, '23514', null, 'nom vide refusé');
select is((select count(*)::int from public.calendar_sources), 1, 'ajout refusé : rien d''enregistré');

-- L'adresse secrète n'est jamais relue, même par sa propriétaire
select throws_ok('select ical_url from public.calendar_source_credentials', '42501', null, 'adresse illisible pour sa propriétaire');
select throws_ok($$update public.calendar_source_credentials set ical_url = null$$, '42501', null, 'adresse non modifiable');

-- Pas d'ajout direct (sans accès), pas d'état de synchronisation inventé, pas d'événement écrit à la main
select throws_ok($$insert into public.calendar_sources (provider, name) values ('ical', 'Direct')$$, '42501', null, 'ajout direct refusé');
select throws_ok($$update public.calendar_sources set last_error = null$$, '42501', null, 'état de synchronisation réservé au serveur');
select throws_ok(
  format($$insert into public.calendar_events (source_id, uid, title, all_day, start_date, end_date) values (%L, 'x', 'Faux', true, '2026-11-10', '2026-11-11')$$, (select v from ids where k = 'perso')),
  '42501', null, 'événements réservés au serveur'
);
select throws_ok(
  format($$select public.replace_calendar_events(%L, '[]')$$, (select v from ids where k = 'perso')),
  '42501', null, 'remplacement des événements réservé au serveur'
);
reset role;

-- ---------------------------------------------------------------------------
-- Synchronisation (serveur) : remplacement d'un bloc
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$select public.replace_calendar_events(%L, %L)$$, (select v from ids where k = 'perso'), '[
    {"uid": "dentiste", "title": "Dentiste", "location": "Lyon", "description": "Carte Vitale", "allDay": false, "startsAt": "2026-11-10T08:00:00Z", "endsAt": "2026-11-10T09:00:00Z"},
    {"uid": "vacances", "title": "Vacances", "location": null, "allDay": true, "startDate": "2026-11-20", "endDate": "2026-11-23"},
    {"uid": "vacances", "title": "Doublon", "location": null, "allDay": true, "startDate": "2026-11-20", "endDate": "2026-11-23"}
  ]'),
  'occurrences enregistrées'
);
select is((select count(*)::int from public.calendar_events), 2, 'doublon d''uid ignoré');
select is((select description from public.calendar_events where uid = 'dentiste'), 'Carte Vitale', 'description enregistrée');
select ok((select last_synced_at is not null and last_error is null from public.calendar_sources where id = (select v from ids where k = 'perso')), 'synchronisation notée');

update public.calendar_sources set last_error = 'Agenda introuvable.' where id = (select v from ids where k = 'perso');
select lives_ok(
  format($$select public.replace_calendar_events(%L, %L)$$, (select v from ids where k = 'perso'), '[
    {"uid": "cafe", "title": "Café", "location": null, "allDay": false, "startsAt": "2026-11-11T08:00:00Z", "endsAt": "2026-11-11T08:30:00Z"}
  ]'),
  'nouvelle synchronisation'
);
select is((select array_agg(title)::text from public.calendar_events), '{Café}', 'les anciennes occurrences sont remplacées');
select is((select last_error from public.calendar_sources where id = (select v from ids where k = 'perso')), null, 'erreur précédente effacée');

select throws_ok(
  format($$select public.replace_calendar_events(%L, '[{"uid": "x", "title": "Fin avant début", "allDay": false, "startsAt": "2026-11-11T09:00:00Z", "endsAt": "2026-11-11T08:00:00Z"}]')$$, (select v from ids where k = 'perso')),
  '23514', null, 'fin avant le début refusée'
);
select throws_ok(
  format($$select public.replace_calendar_events(%L, '[{"uid": "x", "title": "Journée vide", "allDay": true, "startDate": "2026-11-11", "endDate": "2026-11-11"}]')$$, (select v from ids where k = 'perso')),
  '23514', null, 'journée entière sans durée refusée'
);

-- ---------------------------------------------------------------------------
-- Connecté en Eric : voit les agendas du foyer, ne supprime que les siens
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.calendar_sources), 1, 'Eric voit l''agenda de Lucile');
select is((select count(*)::int from public.calendar_events), 1, 'Eric voit ses rendez-vous');
delete from public.calendar_sources where id = (select v from ids where k = 'perso');
select is((select count(*)::int from public.calendar_sources), 1, 'Eric ne supprime pas l''agenda de Lucile');
insert into ids select 'travail', public.add_ical_calendar('Travail', 'https://calendar.google.com/calendar/ical/eric%40gmail.com/private-def/basic.ics');
select is((select count(*)::int from public.calendar_sources where owner_id = auth.uid()), 1, 'Eric ajoute le sien');

-- Lucile ne suit plus son agenda : ses événements disparaissent
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
delete from public.calendar_sources where id = (select v from ids where k = 'perso');
select is((select count(*)::int from public.calendar_sources), 1, 'Lucile supprime le sien');
reset role;
select is((select count(*)::int from public.calendar_events) + (select count(*)::int from public.calendar_source_credentials where source_id = (select v from ids where k = 'perso')), 0, 'événements et adresse supprimés avec la source');

-- ---------------------------------------------------------------------------
-- Réglages : page masquée par défaut, agendas affichés
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.user_settings (hydration_goal_ml) values (1500);
select is((select row(disabled_pages @> '{agenda}', agenda_scope)::text from public.user_settings), row(true, 'all')::text, 'page Agenda masquée par défaut, les deux agendas affichés');
select lives_ok($$update public.user_settings set agenda_scope = 'mine', disabled_pages = '{}', muted_notifications = '{agenda}'$$, 'agendas affichés et notifications réglables');
select throws_ok($$update public.user_settings set agenda_scope = 'personne'$$, '23514', null, 'choix d''agendas inconnu refusé');
select throws_ok($$update public.user_settings set agenda_reminded_on = current_date$$, '42501', null, 'date du résumé réservée au serveur');
select throws_ok($$select * from public.claim_agenda_reminders()$$, '42501', null, 'résumé réservé au serveur');
reset role;

-- ---------------------------------------------------------------------------
-- Résumé du matin (serveur)
-- ---------------------------------------------------------------------------
update public.user_settings set muted_notifications = '{}';
select is((select count(*)::int from public.agenda_reminders_due('2026-11-10T07:00:00Z')), 0, 'pas de résumé sans appareil abonné');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values ('11111111-1111-1111-1111-111111111111', 'https://push.test/lucile', 'k', 'a');
-- 10 novembre, Paris = UTC+1
select is((select count(*)::int from public.agenda_reminders_due('2026-11-10T05:59:00Z')), 0, 'pas de résumé avant 7 h (heure de Paris)');
select is(
  (select row(profile_id, agenda_scope)::text from public.claim_agenda_reminders('2026-11-10T06:10:00Z')),
  row('11111111-1111-1111-1111-111111111111'::uuid, 'mine')::text,
  'résumé du jour réservé à 7 h 10, avec les agendas affichés'
);
select is((select count(*)::int from public.claim_agenda_reminders('2026-11-10T15:10:00Z')), 0, 'un seul résumé par jour');
select is((select count(*)::int from public.agenda_reminders_due('2026-11-11T06:10:00Z')), 1, 'nouveau résumé le lendemain');
update public.user_settings set muted_notifications = '{agenda}';
select is((select count(*)::int from public.agenda_reminders_due('2026-11-11T06:10:00Z')), 0, 'résumé coupé dans les réglages');

select ok(exists (select 1 from cron.job where jobname = 'sync-calendars'), 'synchronisation planifiée');
select ok(exists (select 1 from cron.job where jobname = 'notify-agenda'), 'résumé planifié');

select * from finish();
rollback;
