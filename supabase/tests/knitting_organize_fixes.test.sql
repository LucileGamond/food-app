begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Regrouper : garde-fous ajoutés -------------------------------------------------------------------------------------
select public.create_knit_project('Pull', 'M', null, jsonb_build_array(
  jsonb_build_object('title', 'Dos', 'total_rows', 40),
  jsonb_build_object('title', 'Épaules', 'total_rows', 10),
  jsonb_build_object('title', 'Manche', 'times', 2),
  jsonb_build_object('title', 'Col')
)) as project \gset
select id as back from public.knit_steps where project_id = :'project' and position = 0 \gset
select id as shoulders from public.knit_steps where project_id = :'project' and position = 1 \gset
select id as sleeve from public.knit_steps where project_id = :'project' and position = 2 \gset

update public.knit_steps set done = true where id = :'back';
select throws_ok(format($$select public.merge_knit_steps(%L, '[]', 50)$$, :'back'), '22023', 'Cette étape est terminée : impossible de la regrouper avec la suivante', 'étape terminée : refusé');
update public.knit_steps set done = false where id = :'back';

select throws_ok(format($$select public.merge_knit_steps(%L, '[]', null)$$, :'shoulders'), '22023', 'Les deux étapes ne se tricotent pas le même nombre de fois', 'nombres de fois différents : refusé');

select throws_ok(
  format($$select public.merge_knit_steps(%L, %L, 50)$$, :'back', (select jsonb_agg(jsonb_build_object('kind', 'rows', 'rows', 1, 'text', 'r')) from generate_series(1, 31))),
  '22023', 'Sous-étapes invalides (30 au plus)', 'plus de 30 sous-étapes : refusé avec son explication'
);

-- Regrouper : un diagramme non rattaché de l'étape suivante garde ses rangs (décalés de ceux de la première) -----------
insert into public.knit_charts (project_id, step_id, image_path, grid_top, grid_bottom, rows, start_row, end_row)
values (:'project', :'shoulders', '11111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-0908-0706-050403020100.jpg', 0.1, 0.9, 4, 3, 6);
insert into public.knit_charts (project_id, step_id, image_path, grid_top, grid_bottom, rows, start_row, section_id)
values (:'project', :'shoulders', '11111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-0908-0706-050403020101.jpg', 0.1, 0.9, 4, 2, 'epaule');
select lives_ok(
  format($$select public.merge_knit_steps(%L, '[{"kind":"rows","rows":40,"text":"dos"},{"kind":"rows","rows":10,"text":"épaules","id":"epaule"}]', 50)$$, :'back'),
  'étapes regroupées'
);
select is(
  (select (step_id, start_row, end_row)::text from public.knit_charts where section_id is null and project_id = :'project'),
  (select (:'back'::uuid, 43, 46)::text),
  'diagramme non rattaché : rangs 3 à 6 des épaules → 43 à 46 de l’étape regroupée'
);
select is(
  (select (step_id, start_row)::text from public.knit_charts where section_id = 'epaule'),
  (select (:'back'::uuid, 2)::text),
  'diagramme rattaché : ses rangs se recalculent d’après sa sous-étape (inchangés en base)'
);

-- Séparer : un diagramme non rattaché après la coupure part dans la nouvelle étape, à son rang dans celle-ci -----------
select public.split_knit_step(
  :'back', '[{"kind":"rows","rows":40,"text":"dos"}]', 40, '',
  'Épaules', '[{"kind":"rows","rows":10,"text":"épaules","id":"epaule"}]', 10, ''
) as new_step \gset
select is(
  (select (step_id, start_row, end_row)::text from public.knit_charts where section_id is null and project_id = :'project'),
  (select (:'new_step'::uuid, 3, 6)::text),
  'diagramme non rattaché : de retour aux rangs 3 à 6 de la nouvelle étape'
);
select is((select step_id from public.knit_charts where section_id = 'epaule'), :'new_step'::uuid, 'diagramme rattaché : suit sa sous-étape');

-- Un diagramme avant la coupure reste
insert into public.knit_charts (project_id, step_id, image_path, grid_top, grid_bottom, rows, start_row)
values (:'project', :'back', '11111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-0908-0706-050403020102.jpg', 0.1, 0.9, 4, 5);
select public.merge_knit_steps(:'back', '[{"kind":"rows","rows":40,"text":"dos"},{"kind":"rows","rows":10,"text":"épaules","id":"epaule"}]', 50);
select public.split_knit_step(
  :'back', '[{"kind":"rows","rows":40,"text":"dos"}]', 40, '',
  'Épaules', '[{"kind":"rows","rows":10,"text":"épaules","id":"epaule"}]', 10, ''
);
select is(
  (select step_id from public.knit_charts where image_path like '%0102.jpg'),
  :'back'::uuid,
  'diagramme avant la coupure : reste dans la première étape'
);

-- Lectures gardées : oubliées quand le PDF du patron est remplacé, gardées quand il est seulement retiré --------------
insert into public.knit_patterns (title, pdf_path) values ('Gilet', '11111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.pdf') returning id as pattern \gset
insert into public.knit_pattern_readings (pattern_id, size_index, size_label, reading)
values (:'pattern', 1, 'M', '{"title": "Gilet", "sizes": ["S", "M"], "steps": [{"title": "Dos"}]}');
update public.knit_patterns set title = 'Gilet Rosée' where id = :'pattern';
select is((select count(*)::int from public.knit_pattern_readings where pattern_id = :'pattern'), 1, 'autre champ modifié : lecture gardée');
update public.knit_patterns set pdf_path = null where id = :'pattern';
select is((select count(*)::int from public.knit_pattern_readings where pattern_id = :'pattern'), 1, 'PDF retiré : lecture gardée (même patron)');
update public.knit_patterns set pdf_path = '11111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.pdf' where id = :'pattern';
update public.knit_patterns set pdf_path = '11111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000b.pdf' where id = :'pattern';
select is((select count(*)::int from public.knit_pattern_readings where pattern_id = :'pattern'), 0, 'PDF remplacé : lectures oubliées');

select throws_ok('select public.knit_patterns_forget_readings()', '42501', null, 'déclencheur non appelable directement');

reset role;
select * from finish();
rollback;
