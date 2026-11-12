begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, jsonb_build_array(
  jsonb_build_object('title', 'Dos', 'total_rows', 30, 'stitches', 90, 'sections', '[{"kind":"rows","rows":10,"text":"côtes"},{"kind":"rows","rows":20,"text":"jersey"}]'::jsonb),
  jsonb_build_object('title', 'Manche', 'times', 2),
  jsonb_build_object('title', 'Col')
)) as project \gset
select id as back from public.knit_steps where project_id = :'project' and position = 0 \gset
select id as sleeve from public.knit_steps where project_id = :'project' and position = 1 \gset

-- Déplacer « jersey » du dos vers la manche : les deux étapes d'un coup
select lives_ok(
  format($$select public.set_knit_sections(jsonb_build_array(
    jsonb_build_object('id', %L, 'sections', '[{"kind":"rows","rows":10,"text":"côtes"}]'::jsonb, 'total_rows', 10),
    jsonb_build_object('id', %L, 'sections', '[{"kind":"rows","rows":20,"text":"jersey"}]'::jsonb, 'total_rows', null)
  ))$$, :'back', :'sleeve'),
  'sous-étape déplacée'
);
select is((select (jsonb_array_length(sections), total_rows)::text from public.knit_steps where id = :'back'), '(1,10)', 'le dos garde les côtes');
select is((select sections -> 0 ->> 'text' from public.knit_steps where id = :'sleeve'), 'jersey', 'la manche reçoit le jersey');

-- Séparer le dos : nouvelle étape juste après, positions décalées, mailles de fin passées à la nouvelle
select public.split_knit_step(:'back', '[{"kind":"rows","rows":4,"text":"côtes"}]', 4, 'Dos (suite)', '[{"kind":"rows","rows":6,"text":"côtes"}]', 6) as part \gset
select is(
  (select array_agg(title order by position) from public.knit_steps where project_id = :'project'),
  array['Dos', 'Dos (suite)', 'Manche', 'Col'],
  'nouvelle étape juste après'
);
select is((select array_agg(position order by position) from public.knit_steps where project_id = :'project'), array[0, 1, 2, 3], 'positions continues');
select is((select (total_rows, stitches)::text from public.knit_steps where id = :'part'), '(6,90)', 'la suite a ses rangs et les mailles de fin');
select is((select stitches from public.knit_steps where id = :'back'), null::integer, 'l’étape séparée n’a plus de mailles de fin');

-- Garde-fous
select throws_ok(format($$select public.split_knit_step(%L, '[]', null, 'X', '[]', null)$$, :'part'), '22023', null, 'séparer sans sous-étape : refusé');
update public.knit_steps set row_count = 2 where id = :'sleeve';
select throws_ok(
  format($$select public.set_knit_sections(jsonb_build_array(jsonb_build_object('id', %L, 'sections', '[]'::jsonb, 'total_rows', null)))$$, :'sleeve'),
  '22023', null, 'étape commencée : refusé'
);
select throws_ok(format($$select public.split_knit_step(%L, '[]', null, 'X', '[{"kind":"rows","rows":1}]', null)$$, :'sleeve'), '22023', null, 'séparer une étape commencée : refusé');
update public.knit_steps set row_count = 0 where id = :'sleeve';
update public.knit_projects set adaptation = '{"active": true, "request": "plus long", "steps": [{"step_id": "x"}]}' where id = :'project';
select throws_ok(
  format($$select public.set_knit_sections(jsonb_build_array(jsonb_build_object('id', %L, 'sections', '[]'::jsonb, 'total_rows', null)))$$, :'sleeve'),
  '22023', null, 'adaptation : refusé'
);
update public.knit_projects set adaptation = null where id = :'project';

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  format($$select public.set_knit_sections(jsonb_build_array(jsonb_build_object('id', %L, 'sections', '[]'::jsonb, 'total_rows', null)))$$, :'sleeve'),
  'P0002', null, 'étape de quelqu’un d’autre : introuvable'
);

reset role;
select * from finish();
rollback;
