begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, jsonb_build_array(jsonb_build_object('title', 'Dos', 'stitches', 90))) as project \gset
select is((select start_stitches from public.knit_steps where project_id = :'project'), null::integer, 'déduit de la fin par défaut');
update public.knit_steps set start_stitches = 98 where project_id = :'project';
select is((select start_stitches from public.knit_steps where project_id = :'project'), 98, 'mailles au début saisies');
select throws_ok(format($$update public.knit_steps set start_stitches = 0 where project_id = %L$$, :'project'), '23514', null, 'au moins une maille');

reset role;
select * from finish();
rollback;
