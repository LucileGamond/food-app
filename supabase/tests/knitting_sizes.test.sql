begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, jsonb_build_array(jsonb_build_object('title', 'Dos', 'instructions', repeat('Monter 60 (64-68) m. ', 900)))) as project \gset
select is((select char_length(instructions) from public.knit_steps where project_id = :'project'), 18900, 'texte recopié long accepté');

update public.knit_projects set sizes = '{S,M,L}', size_index = 2 where id = :'project';
select is((select size_index from public.knit_projects where id = :'project'), 2::smallint, 'taille mise en valeur');
select throws_ok(format($$update public.knit_projects set size_index = 3 where id = %L$$, :'project'), '23514', null, 'taille hors de la liste refusée');
select throws_ok(format($$update public.knit_projects set sizes = '{S}' where id = %L$$, :'project'), '23514', null, 'liste plus courte que la taille choisie refusée');

update public.knit_steps set highlights = '{"2": {"7": true, "11": false}}' where project_id = :'project';
select is((select highlights -> '2' ->> '7' from public.knit_steps where project_id = :'project'), 'true', 'surlignage corrigé');
select throws_ok(format($$update public.knit_steps set highlights = '[]' where project_id = %L$$, :'project'), '23514', null, 'corrections : un objet');

reset role;
select * from finish();
rollback;
