begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, '[{"title": "Dos"}]'::jsonb) as project \gset

update public.knit_projects set abbreviations = '[{"abbr": "ssk", "meaning": "Surjet simple."}]', yarn_checks = '[{"yarn": 0, "grams": 82.5, "rows_done": 40, "at": "2026-11-08"}, {"yarn": 1, "grams": 30, "rows_done": 40}]' where id = :'project';
select is((select yarn_checks -> 1 ->> 'grams' from public.knit_projects where id = :'project'), '30', 'pesée de chaque laine enregistrée');
select throws_ok(format($$update public.knit_projects set yarn_checks = '[{"yarn": 0, "grams": -1, "rows_done": 3}]' where id = %L$$, :'project'), '23514', null, 'poids négatif refusé');
select throws_ok(format($$update public.knit_projects set yarn_checks = '[{"yarn": 0, "grams": 1, "rows_done": 3}, {"yarn": 0, "grams": 2, "rows_done": 3}]' where id = %L$$, :'project'), '23514', null, 'une pesée par laine');
select throws_ok(format($$update public.knit_projects set yarn_checks = '[{"yarn": 6, "grams": 1, "rows_done": 3}]' where id = %L$$, :'project'), '23514', null, 'laine inconnue refusée');
select throws_ok(format($$update public.knit_projects set yarn_checks = null where id = %L$$, :'project'), '23502', null, 'pesées : jamais null');
select throws_ok(format($$update public.knit_projects set abbreviations = '{}' where id = %L$$, :'project'), '23514', null, 'abréviations : une liste');

update public.knit_steps set translation = 'Monter 64 m.' where project_id = :'project';
select is((select translation from public.knit_steps where project_id = :'project'), 'Monter 64 m.', 'traduction enregistrée');
select throws_ok(format($$update public.knit_steps set translation = repeat('x', 30001) where project_id = %L$$, :'project'), '23514', null, 'traduction bornée');

select is((select meaning from public.knit_glossary where lang = 'en' and abbr = 'ssk') is not null, true, 'glossaire lisible');
select ok((select count(*) from public.knit_glossary where lang = 'fr') >= 20, 'abréviations françaises');
select throws_ok($$insert into public.knit_glossary (lang, abbr, meaning) values ('fr', 'zz', 'x')$$, '42501', null, 'glossaire en lecture seule');

reset role;
select * from finish();
rollback;
