begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Tests indépendants des données locales (annulés en fin de transaction)
delete from public.shopping_lists;
delete from public.push_subscriptions;

set local role anon;
select throws_ok('select count(*) from public.shopping_lists', '42501', null, 'anon ne lit pas les listes');
select throws_ok('select count(*) from public.shopping_items', '42501', null, 'anon ne lit pas les articles');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Listes et articles
insert into public.shopping_lists (id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Courses');
select throws_ok($$insert into public.shopping_lists (name) values ('  ')$$, '23514', null, 'nom de liste requis');

insert into public.shopping_items (list_id, name, quantity, unit, aisle)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Farine', 500, 'g', 'EPICERIE_SALEE');
select throws_ok(
  $$insert into public.shopping_items (list_id, name, unit) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Sel', 'pluche')$$,
  '23514', null, 'unité hors liste refusée'
);
select throws_ok(
  $$insert into public.shopping_items (list_id, name, quantity) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Sel', 0)$$,
  '23514', null, 'quantité nulle refusée'
);
select throws_ok(
  $$insert into public.shopping_items (list_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', ' ')$$,
  '23514', null, 'nom d''article requis'
);
select is(
  (select aisle::text from public.shopping_items where name = 'Farine'), 'EPICERIE_SALEE', 'rayon enregistré'
);

-- La date de la liste suit les modifications d'articles
update public.shopping_lists set updated_at = now() - interval '1 day';
insert into public.shopping_items (list_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Lait');
select ok((select updated_at > now() - interval '1 minute' from public.shopping_lists), 'liste rafraîchie après un ajout');

-- Journal des modifications (notifications)
reset role;
select results_eq(
  $$select kind::text, item_name, actor_id::text from public.shopping_events order by id$$,
  $$values ('ADDED', 'Farine', '11111111-1111-1111-1111-111111111111'), ('ADDED', 'Lait', '11111111-1111-1111-1111-111111111111')$$,
  'ajouts journalisés avec leur auteur'
);
set local role authenticated;
update public.shopping_items set checked = true where name = 'Lait';
update public.shopping_items set checked = false where name = 'Lait';
update public.shopping_items set quantity = 600 where name = 'Farine';
update public.shopping_items set position = 5 where name = 'Farine';
reset role;
select results_eq(
  $$select kind::text from public.shopping_events where kind <> 'ADDED' order by id$$,
  $$values ('CHECKED'), ('UNCHECKED'), ('UPDATED')$$,
  'cocher, décocher, modifier journalisés ; changer l''ordre ne l''est pas'
);
set local role authenticated;
delete from public.shopping_items where name = 'Farine';
reset role;
select is((select count(*)::int from public.shopping_events where kind = 'REMOVED'), 1, 'suppression journalisée');
set local role authenticated;
update public.shopping_items set checked = true where name = 'Lait';
delete from public.shopping_items where checked;
reset role;
select is((select count(*)::int from public.shopping_events where kind = 'REMOVED'), 1, 'retirer les cochés n''est pas journalisé');
set local role authenticated;

-- Les utilisateurs n'accèdent pas au journal
select throws_ok('select count(*) from public.shopping_events', '42501', null, 'journal inaccessible aux utilisateurs');

-- Suppression de la liste : articles et événements supprimés, sans nouvel événement
insert into public.shopping_items (list_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Pain');
delete from public.shopping_lists;
reset role;
select is((select count(*)::int from public.shopping_items), 0, 'articles supprimés avec la liste');
select is((select count(*)::int from public.shopping_events), 0, 'événements supprimés avec la liste');

-- Modification sans utilisateur (service) : rien à notifier
select set_config('request.jwt.claims', '', true);
insert into public.shopping_lists (id, name) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Service');
insert into public.shopping_items (list_id, name) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Café');
select is((select count(*)::int from public.shopping_events), 0, 'pas d''événement sans utilisateur');

-- Abonnements : chacun ne voit que ses appareils
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/tel-lucile', 'cle', 'secret', 'Android')$$,
  'abonnement enregistré'
);
select throws_ok(
  $$select public.save_push_subscription('http://push.exemple/x', 'cle', 'secret')$$,
  '22023', null, 'adresse https obligatoire'
);
select throws_ok(
  $$select public.save_push_subscription('https://pirate.exemple/x', 'cle', 'secret')$$,
  '22023', null, 'seulement les services de notification des navigateurs'
);
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/tel-eric', 'cle', 'secret');
select is((select count(*)::int from public.push_subscriptions), 1, 'Eric ne voit que son appareil');
select throws_ok(
  $$insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values ('11111111-1111-1111-1111-111111111111', 'https://fcm.googleapis.com/fcm/send/y', 'a', 'b')$$,
  '42501', null, 'pas d''insertion directe (passer par save_push_subscription)'
);
select throws_ok(
  $$update public.push_subscriptions set endpoint = 'https://pirate.exemple/y'$$,
  '42501', null, 'pas de modification directe'
);
-- Un autre compte ne peut pas détourner l'appareil de Lucile (clés différentes)
select throws_ok(
  $$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/tel-lucile', 'autre-cle', 'autre-secret')$$,
  '42501', null, 'appareil d''un autre compte non détourné'
);
-- Le téléphone de Lucile (mêmes clés) est repris par le compte d'Eric
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/tel-lucile', 'cle', 'secret');
select is((select count(*)::int from public.push_subscriptions), 2, 'appareil réattribué à Eric');
delete from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/tel-eric';
select is((select count(*)::int from public.push_subscriptions), 1, 'Eric peut retirer son appareil');
reset role;
set local role anon;
select throws_ok($$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/z', 'a', 'b')$$, '42501', null, 'anon ne s''abonne pas');
reset role;

-- Tâche planifiée
select is((select schedule from cron.job where jobname = 'notify-shopping'), '*/3 * * * *', 'tâche planifiée toutes les 3 minutes');
select is((select count(*)::int from cron.job where jobname = 'notify-shopping'), 1, 'une seule tâche notify-shopping');
select ok(
  (select command from cron.job where jobname = 'notify-shopping') like '%exists (select 1 from vault.decrypted_secrets where name = ''notify_shopping_secret'')%',
  'appel seulement si le Vault contient aussi le secret'
);

select * from finish();
rollback;
