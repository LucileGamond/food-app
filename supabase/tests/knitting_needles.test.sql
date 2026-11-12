begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.create_knit_project('Pull', 'M', null, jsonb_build_array(jsonb_build_object('title', 'Dos'))) as project \gset
select is((select needles from public.knit_projects where id = :'project'), '[]'::jsonb, 'pas d’aiguille au départ');

update public.knit_projects set needles = '[3, 3.5]' where id = :'project';
select is((select needles from public.knit_projects where id = :'project'), '[3, 3.5]'::jsonb, 'aiguilles du patron enregistrées');
select throws_ok(
  format($$update public.knit_projects set needles = '{"mm": 3}' where id = %L$$, :'project'),
  '23514', null, 'une liste seulement'
);
select throws_ok(
  format($$update public.knit_projects set needles = '[1,2,3,4,5,6,7,8,9,10,11]' where id = %L$$, :'project'),
  '23514', null, 'dix aiguilles au plus'
);

reset role;
select * from finish();
rollback;
