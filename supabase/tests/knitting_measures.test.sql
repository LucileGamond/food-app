begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

delete from public.knit_measures;

set local role anon;
select throws_ok('select count(*) from public.knit_measures', '42501', null, 'anon ne voit pas les fiches de mesures');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.knit_measures (name, chest, hip) values ('Léa', 92.5, 98);
select is((select profile_id from public.knit_measures), '11111111-1111-1111-1111-111111111111'::uuid, 'fiche à la personne connectée');
select is((select chest from public.knit_measures), 92.5::numeric, 'mesure au demi-centimètre');
select throws_ok($$insert into public.knit_measures (name) values ('  ')$$, '23514', null, 'nom obligatoire');
select throws_ok($$insert into public.knit_measures (name, chest) values ('Moi', 5)$$, '23514', null, 'mesure bornée');
select throws_ok($$insert into public.knit_measures (name, profile_id) values ('Moi', '22222222-2222-2222-2222-222222222222')$$, '42501', null, 'pas de fiche pour un autre');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_measures), 0, 'fiches de chacun');
reset role;

select * from finish();
rollback;
