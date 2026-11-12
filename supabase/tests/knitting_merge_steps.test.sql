begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, jsonb_build_array(
  jsonb_build_object('title', 'Dos – côtes', 'instructions', 'Monter 98 m.', 'total_rows', 18, 'stitches', 98),
  jsonb_build_object('title', 'Dos – jersey', 'instructions', 'Jersey 30 cm.', 'stitches', 90),
  jsonb_build_object('title', 'Manche', 'times', 2),
  jsonb_build_object('title', 'Col')
)) as project \gset
select id as first from public.knit_steps where project_id = :'project' and position = 0 \gset
select id as second from public.knit_steps where project_id = :'project' and position = 1 \gset
select id as sleeve from public.knit_steps where project_id = :'project' and position = 2 \gset

insert into public.knit_charts (project_id, step_id, image_path, grid_top, grid_bottom, rows, start_row)
values (:'project', :'second', '11111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-0908-0706-050403020100.jpg', 0.1, 0.9, 24, 1);
update public.knit_steps set notes = 'Laine rouge' where id = :'second';

select lives_ok(
  format($$select public.merge_knit_steps(%L, '[{"kind":"rows","rows":18,"text":"côtes"},{"kind":"rows","rows":null,"text":"jersey","pattern":"30 cm"}]', null)$$, :'first'),
  'étape regroupée avec la suivante'
);
select is((select count(*)::int from public.knit_steps where project_id = :'project'), 3, 'l’étape suivante est supprimée');
select is(
  (select (instructions, stitches, total_rows, notes)::text from public.knit_steps where id = :'first'),
  (select (e'Monter 98 m.\n\nJersey 30 cm.', 90, null::integer, 'Laine rouge')::text),
  'textes bout à bout, mailles de la fin, rangs inconnus, notes gardées'
);
select is((select jsonb_array_length(sections) from public.knit_steps where id = :'first'), 2, 'sous-étapes enregistrées');
select is((select step_id from public.knit_charts where project_id = :'project'), :'first'::uuid, 'le diagramme suit');
select is(
  (select array_agg(title order by position) from public.knit_steps where project_id = :'project'),
  array['Dos – côtes', 'Manche', 'Col'],
  'positions renumérotées'
);
select is((select array_agg(position order by position) from public.knit_steps where project_id = :'project'), array[0, 1, 2], 'positions continues');

-- Garde-fous : étape suivante commencée, dernière étape, adaptation, étape d'un autre projet
update public.knit_steps set row_count = 3 where project_id = :'project' and position = 2;
select throws_ok(format($$select public.merge_knit_steps(%L, '[]', null)$$, :'sleeve'), '22023', null, 'étape suivante commencée : refusé');
select throws_ok(
  format($$select public.merge_knit_steps((select id from public.knit_steps where project_id = %L and position = 2), '[]', null)$$, :'project'),
  '22023', null, 'dernière étape : rien à regrouper'
);
update public.knit_steps set row_count = 0 where project_id = :'project';
update public.knit_projects set adaptation = '{"active": true, "request": "plus long", "steps": [{"step_id": "x"}]}' where id = :'project';
select throws_ok(format($$select public.merge_knit_steps(%L, '[]', null)$$, :'sleeve'), '22023', null, 'adaptation : refusé');
update public.knit_projects set adaptation = null where id = :'project';

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(format($$select public.merge_knit_steps(%L, '[]', null)$$, :'sleeve'), 'P0002', null, 'étape de quelqu’un d’autre : introuvable');

reset role;
select * from finish();
rollback;
