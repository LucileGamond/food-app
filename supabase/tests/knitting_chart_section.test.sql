begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, jsonb_build_array(
  jsonb_build_object('title', 'Dos', 'total_rows', 30, 'sections', '[{"kind":"rows","rows":10,"text":"côtes","id":"a1"},{"kind":"rows","rows":20,"text":"torsades","id":"a2"}]'::jsonb),
  jsonb_build_object('title', 'Manche', 'total_rows', 12, 'sections', '[{"kind":"rows","rows":12,"text":"côtes","id":"b1"}]'::jsonb)
)) as project \gset
select id as back from public.knit_steps where project_id = :'project' and position = 0 \gset
select id as sleeve from public.knit_steps where project_id = :'project' and position = 1 \gset

insert into public.knit_charts (project_id, step_id, section_id, image_path, grid_top, grid_bottom, rows, start_row, end_row)
values (:'project', :'back', 'a2', '11111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-0908-0706-050403020100.jpg', 0.1, 0.9, 4, 11, 30);
select is((select section_id from public.knit_charts where project_id = :'project'), 'a2', 'diagramme lié à sa sous-étape');

-- Sous-étape déplacée vers la manche : le diagramme la suit
select public.set_knit_sections(jsonb_build_array(
  jsonb_build_object('id', :'back', 'sections', '[{"kind":"rows","rows":10,"text":"côtes","id":"a1"}]'::jsonb, 'total_rows', 10, 'instructions', ''),
  jsonb_build_object('id', :'sleeve', 'sections', '[{"kind":"rows","rows":12,"text":"côtes","id":"b1"},{"kind":"rows","rows":20,"text":"torsades","id":"a2"}]'::jsonb, 'total_rows', 32, 'instructions', '')
));
select is((select step_id from public.knit_charts where project_id = :'project'), :'sleeve'::uuid, 'déplacée : le diagramme change d’étape avec elle');

-- Séparée dans une nouvelle étape : il la suit encore
select public.split_knit_step(:'sleeve', '[{"kind":"rows","rows":12,"text":"côtes","id":"b1"}]', 12, '', 'Manche (suite)', '[{"kind":"rows","rows":20,"text":"torsades","id":"a2"}]', 20, '') as part \gset
select is((select step_id from public.knit_charts where project_id = :'project'), :'part'::uuid, 'séparée : le diagramme part avec elle');

-- Regroupée : il reste avec elle
select public.merge_knit_steps(:'sleeve', '[{"kind":"rows","rows":12,"text":"côtes","id":"b1"},{"kind":"rows","rows":20,"text":"torsades","id":"a2"}]', 32);
select is((select step_id from public.knit_charts where project_id = :'project'), :'sleeve'::uuid, 'regroupée : le diagramme reste avec elle');

-- Un diagramme sans sous-étape ne bouge pas
insert into public.knit_charts (project_id, step_id, image_path, grid_top, grid_bottom, rows, start_row)
values (:'project', :'back', '11111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-0908-0706-050403020101.jpg', 0.1, 0.9, 4, 1);
update public.knit_steps set sections = sections where id = :'sleeve';
select is((select count(*)::int from public.knit_charts where step_id = :'back'), 1, 'sans sous-étape : il reste sur son étape');

reset role;
select * from finish();
rollback;
