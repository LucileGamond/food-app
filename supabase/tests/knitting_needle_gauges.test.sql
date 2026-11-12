begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, jsonb_build_array(jsonb_build_object('title', 'Dos'))) as project \gset
select is((select needle_gauges from public.knit_projects where id = :'project'), '[]'::jsonb, 'aucun échantillon par aiguille au départ');
update public.knit_projects set needle_gauges = '[{"needle": 3.5, "stitches": 22, "rows": 30, "checked": true}]' where id = :'project';
select is((select needle_gauges -> 0 ->> 'rows' from public.knit_projects where id = :'project'), '30', 'échantillon de l’aiguille enregistré');
select throws_ok(format($$update public.knit_projects set needle_gauges = '{}' where id = %L$$, :'project'), '23514', null, 'une liste seulement');

reset role;
select * from finish();
rollback;
