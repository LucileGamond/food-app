begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into ids values ('project', public.create_knit_project('Pull', 'M', null, '[{"title": "Manches", "instructions": "", "total_rows": 120, "stitches": 60, "sections": []}]'));

select is((select adaptation from public.knit_projects where id = (select v from ids where k = 'project')), null, 'pas d''adaptation au départ');

update public.knit_projects
set adaptation = '{"request": "5 cm de plus aux manches", "active": true, "at": "2026-11-08T10:00:00Z", "steps": [{"step_id": "x", "total_rows": 136, "stitches": 66, "sections": [], "note": "16 rangs de plus."}]}'
where id = (select v from ids where k = 'project');
select is((select adaptation ->> 'request' from public.knit_projects where id = (select v from ids where k = 'project')), '5 cm de plus aux manches', 'adaptation enregistrée');

select throws_ok(
  $$update public.knit_projects set adaptation = '{"request": "", "active": "oui", "steps": [{}]}'$$,
  '23514', null, 'adaptation mal formée refusée'
);
select throws_ok(
  format($$update public.knit_projects set adaptation = jsonb_build_object('request', %L, 'active', true, 'steps', '[{}]'::jsonb)$$, repeat('x', 1001)),
  '23514', null, 'retouches de 1000 caractères au plus'
);

-- Eric ne peut pas toucher à l'adaptation du projet de Lucile.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
update public.knit_projects set adaptation = null where id = (select v from ids where k = 'project');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select isnt((select adaptation from public.knit_projects where id = (select v from ids where k = 'project')), null, 'projet d''un autre : adaptation intacte');

update public.knit_projects set adaptation = null where id = (select v from ids where k = 'project');
select is((select adaptation from public.knit_projects where id = (select v from ids where k = 'project')), null, 'adaptation supprimée, patron d''origine gardé');

select * from finish();
rollback;
