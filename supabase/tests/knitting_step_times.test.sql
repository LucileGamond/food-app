begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, jsonb_build_array(jsonb_build_object('title', 'Manche'))) as project \gset
select is((select (times, pass)::text from public.knit_steps where project_id = :'project'), '(1,1)', 'une fois par défaut');

update public.knit_steps set times = 2 where project_id = :'project';
update public.knit_steps set pass = 2, row_count = 0 where project_id = :'project';
select is((select (times, pass)::text from public.knit_steps where project_id = :'project'), '(2,2)', 'deuxième fois de deux');

select throws_ok(format($$update public.knit_steps set pass = 3 where project_id = %L$$, :'project'), '23514', null, 'fois au-delà du nombre de fois refusée');
select throws_ok(format($$update public.knit_steps set times = 1 where project_id = %L$$, :'project'), '23514', null, 'nombre de fois sous la fois en cours refusé');
select throws_ok(format($$update public.knit_steps set times = 11 where project_id = %L$$, :'project'), '23514', null, 'au plus 10 fois');

update public.knit_steps set times = 1, pass = 1 where project_id = :'project';
select is((select (times, pass)::text from public.knit_steps where project_id = :'project'), '(1,1)', 'retour à une fois, ensemble');

-- Nombre de fois lu dans le patron : gardé à la création ; invalide (texte, 0, 11, décimal) : 1
select public.create_knit_project('Gilet', 'M', null, jsonb_build_array(
  jsonb_build_object('title', 'Manches', 'times', 2),
  jsonb_build_object('title', 'A', 'times', 0),
  jsonb_build_object('title', 'B', 'times', 11),
  jsonb_build_object('title', 'C', 'times', '2'),
  jsonb_build_object('title', 'D', 'times', 1.5)
)) as gilet \gset
select is((select times from public.knit_steps where project_id = :'gilet' and title = 'Manches'), 2::smallint, 'deux manches lues dans le patron');
select is((select array_agg(times order by position) from public.knit_steps where project_id = :'gilet' and title <> 'Manches'), '{1,1,1,1}'::smallint[], 'nombre de fois invalide : 1');

reset role;
select * from finish();
rollback;
