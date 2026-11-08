begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, '[{"title": "Dos"}]'::jsonb) as project \gset

update public.knit_projects set abbreviations = '[{"abbr": "ssk", "meaning": "Surjet simple."}]', yarn_check = '{"grams": 82.5, "rows_done": 40, "at": "2026-11-08"}' where id = :'project';
select is((select yarn_check ->> 'grams' from public.knit_projects where id = :'project'), '82.5', 'pesée enregistrée');
select throws_ok(format($$update public.knit_projects set yarn_check = '{"grams": -1, "rows_done": 3}' where id = %L$$, :'project'), '23514', null, 'poids négatif refusé');
select throws_ok(format($$update public.knit_projects set abbreviations = '{}' where id = %L$$, :'project'), '23514', null, 'abréviations : une liste');

update public.knit_steps set translation = 'Monter 64 m.' where project_id = :'project';
select is((select translation from public.knit_steps where project_id = :'project'), 'Monter 64 m.', 'traduction enregistrée');
select throws_ok(format($$update public.knit_steps set translation = repeat('x', 30001) where project_id = %L$$, :'project'), '23514', null, 'traduction bornée');

reset role;
select * from finish();
rollback;
