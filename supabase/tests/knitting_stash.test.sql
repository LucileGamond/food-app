begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

delete from public.knit_stash;
delete from public.knit_patterns;

set local role anon;
select throws_ok('select count(*) from public.knit_stash', '42501', null, 'anon ne voit pas le stock');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.knit_stash (yarn) values ('{"brand": "DROPS", "length_m": 105, "skeins": 8, "needle_mm": 4}');
select is((select profile_id from public.knit_stash), '11111111-1111-1111-1111-111111111111'::uuid, 'laine à la personne connectée');
select throws_ok($$insert into public.knit_stash (yarn) values ('{}')$$, '23514', null, 'laine vide refusée');
select throws_ok($$insert into public.knit_stash (yarn) values ('{"skeins": 2.3}')$$, '23514', null, 'laine invalide refusée');
update public.knit_stash set yarn = yarn || '{"skeins": 5}';
select is((select (yarn ->> 'skeins')::numeric from public.knit_stash), 5::numeric, 'stock modifié');

insert into public.knit_patterns (title, url, meters_needed, needle_mm) values ('Gilet', 'https://patrons.exemple/gilet', 600, 4);
select throws_ok($$insert into public.knit_patterns (title, url, meters_needed) values ('Pull', 'https://p.exemple', 0)$$, '23514', null, 'métrage borné');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_stash), 0, 'stock de chacun');
select is((select count(*)::int from public.knit_patterns where meters_needed = 600), 0, 'patrons de chacun');
reset role;

select * from finish();
rollback;
