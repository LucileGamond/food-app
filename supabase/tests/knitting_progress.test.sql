begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into ids values ('project', public.create_knit_project('Pull', 'M', null, '[{"title": "Dos", "instructions": "", "total_rows": 10, "stitches": 64, "sections": []}]'));
insert into ids select 'step', id from public.knit_steps where project_id = (select v from ids where k = 'project');

update public.knit_projects set notes = 'Manches raccourcies' where id = (select v from ids where k = 'project');
select is((select notes from public.knit_projects where id = (select v from ids where k = 'project')), 'Manches raccourcies', 'notes du projet');
select throws_ok(format($$update public.knit_projects set notes = %L$$, repeat('x', 5001)), '23514', null, 'notes de 5000 caractères au plus');

insert into public.knit_progress_photos (project_id, step_id, storage_path, caption)
values ((select v from ids where k = 'project'), (select v from ids where k = 'step'), '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.jpg', 'Fin du dos');
select is((select count(*)::int from public.knit_progress_photos), 1, 'photo ajoutée');
select throws_ok(
  format($$insert into public.knit_progress_photos (project_id, storage_path) values (%L, '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000002.jpg')$$, (select v from ids where k = 'project')),
  '42501', null, 'photo hors de son dossier refusée'
);
select throws_ok(
  format($$insert into public.knit_progress_photos (project_id, storage_path, caption) values (%L, '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000003.jpg', %L)$$, (select v from ids where k = 'project'), repeat('x', 201)),
  '23514', null, 'légende de 200 caractères au plus'
);
update public.knit_progress_photos set caption = 'Dos fini';
select is((select caption from public.knit_progress_photos), 'Dos fini', 'légende modifiée');

-- Eric ne voit ni les notes ni les photos de Lucile, et ne peut pas en ajouter à son projet.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_progress_photos), 0, 'photos de chacun');
select throws_ok(
  format($$insert into public.knit_progress_photos (project_id, storage_path) values (%L, '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000004.jpg')$$, (select v from ids where k = 'project')),
  '42501', null, 'pas de photo sur le projet d''un autre'
);
reset role;

select ok(
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.jpg' in (select public.referenced_files('knit-photos')),
  'photos d''avancement gardées par le ménage de nuit'
);
-- Projet supprimé : ses photos aussi.
delete from public.knit_projects where id = (select v from ids where k = 'project');
select is((select count(*)::int from public.knit_progress_photos), 0, 'photos supprimées avec le projet');

select * from finish();
rollback;
