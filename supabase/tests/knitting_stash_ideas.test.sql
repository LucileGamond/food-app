begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

delete from public.knit_stash_ideas;
delete from public.knit_stash;

set local role anon;
select throws_ok('select count(*) from public.knit_stash_ideas', '42501', null, 'anon ne voit pas les idées');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.knit_stash (id, yarn) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '{"brand": "DROPS", "length_m": 105, "skeins": 8}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '{"brand": "Alpaga", "length_m": 100, "skeins": 2}');

insert into public.knit_stash_ideas (stash_ids, ideas, weight) values
  ('{aaaaaaaa-0000-0000-0000-000000000001}', '[{"title": "Bonnet"}]', 'worsted');
select is((select profile_id from public.knit_stash_ideas), '11111111-1111-1111-1111-111111111111'::uuid, 'idées à la personne connectée');

insert into public.knit_stash_ideas (stash_ids, wish, ideas) values
  ('{aaaaaaaa-0000-0000-0000-000000000001,aaaaaaaa-0000-0000-0000-000000000002}', 'rayures', '[{"title": "Snood"}]');
select throws_ok($$insert into public.knit_stash_ideas (stash_ids, ideas) values ('{aaaaaaaa-0000-0000-0000-000000000001}', '[{"title": "x"}]')$$, '23505', null, 'une ligne par ensemble de laines');
select throws_ok($$insert into public.knit_stash_ideas (stash_ids, ideas) values ('{}', '[{"title": "x"}]')$$, '23514', null, 'au moins une laine');
select throws_ok($$insert into public.knit_stash_ideas (stash_ids, ideas) values ('{aaaaaaaa-0000-0000-0000-000000000003}', '[]')$$, '23514', null, 'au moins une idée');
select throws_ok($$insert into public.knit_stash_ideas (stash_ids, ideas) values ('{aaaaaaaa-0000-0000-0000-000000000003}', '{"title": "x"}')$$, '23514', null, 'idées en liste');

update public.knit_stash_ideas set ideas = '[{"title": "Mitaines"}]', wish = 'petit' where cardinality(stash_ids) = 1;
select is((select ideas -> 0 ->> 'title' from public.knit_stash_ideas where cardinality(stash_ids) = 1), 'Mitaines', 'idées relancées');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_stash_ideas), 0, 'idées de chacun');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
delete from public.knit_stash where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is((select count(*)::int from public.knit_stash_ideas), 1, 'laine retirée : ses idées associées partent');
delete from public.knit_stash;
select is((select count(*)::int from public.knit_stash_ideas), 0, 'plus de laine, plus d’idées');
reset role;

select * from finish();
rollback;
