begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Base locale partagée : on part sans diagramme (tout est annulé à la fin).
delete from public.knit_charts;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, '[{"title": "Dos"}]'::jsonb) as project \gset
select id as step from public.knit_steps where project_id = :'project' \gset

insert into public.knit_charts (project_id, step_id, image_path, grid_top, grid_bottom, rows, start_row)
values (:'project', :'step', '11111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-0908-0706-050403020100.jpg', 0.1, 0.9, 24, 5);
select is((select rows from public.knit_charts), 24, 'diagramme ajouté à mon projet');

select throws_ok(
  format($$insert into public.knit_charts (project_id, image_path, grid_top, grid_bottom, rows) values (%L, '11111111-1111-1111-1111-111111111111/a.jpg', 0.8, 0.2, 10)$$, :'project'),
  '23514', null, 'haut du diagramme sous le bas : refusé');
select throws_ok(
  format($$insert into public.knit_charts (project_id, image_path, grid_top, grid_bottom, rows) values (%L, '22222222-2222-2222-2222-222222222222/a.jpg', 0, 1, 10)$$, :'project'),
  '42501', null, 'image dans le dossier de quelqu’un d’autre : refusée');

update public.knit_charts set rows = 12, repeats = false;
select throws_ok('update public.knit_charts set flat = false, odd_only = true', '23514', null, 'rangs endroit seuls : seulement à plat');
select is((select rows from public.knit_charts), 12, 'calage modifié');
-- Rattaché à une sous-étape : s'arrête à sa fin, pas avant son début
update public.knit_charts set start_row = 5, end_row = 28;
select is((select end_row from public.knit_charts), 28, 'fin du diagramme : fin de sa sous-étape');
select throws_ok('update public.knit_charts set end_row = 4', '23514', null, 'fin avant le début : refusée');
update public.knit_projects set chart_hints = '[{"page": 4, "title": "Torsade", "rows": 24, "step": 0, "flat": true, "oddOnly": false}]' where id = :'project';
select is((select chart_hints -> 0 ->> 'page' from public.knit_projects where id = :'project'), '4', 'diagrammes repérés enregistrés');
select throws_ok(format($$update public.knit_projects set chart_hints = '{}' where id = %L$$, :'project'), '23514', null, 'diagrammes repérés : une liste');
select throws_ok('update public.knit_charts set image_path = image_path', '42501', null, 'image non modifiable');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_charts), 0, 'diagrammes de chacun');
select throws_ok(
  format($$insert into public.knit_charts (project_id, image_path, grid_top, grid_bottom, rows) values (%L, '22222222-2222-2222-2222-222222222222/b.jpg', 0, 1, 10)$$, :'project'),
  '42501', null, 'pas de diagramme dans le projet d’un autre');
reset role;

set local role anon;
select throws_ok('select count(*) from public.knit_charts', '42501', null, 'anon ne voit pas les diagrammes');
reset role;

delete from public.knit_projects where id = :'project';
select is((select count(*)::int from public.knit_charts), 0, 'diagrammes supprimés avec le projet');

select * from finish();
rollback;
