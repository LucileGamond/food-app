begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

delete from public.knit_projects;
delete from public.knit_patterns;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

set local role anon;
select throws_ok('select count(*) from public.knit_patterns', '42501', null, 'anon ne voit pas la bibliothèque');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Formats : photos dans son dossier, 10 au plus
-- ---------------------------------------------------------------------------
with p as (
  insert into public.knit_patterns (title, photos, url)
  values ('Châle', array['11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000011.jpg'], 'https://patrons.exemple/chale')
  returning id
)
insert into ids select 'photos', id from p;
select is((select profile_id from public.knit_patterns), '11111111-1111-1111-1111-111111111111'::uuid, 'patron à la personne connectée');
select throws_ok(
  $$insert into public.knit_patterns (title, photos) values ('Volé', array['22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000012.jpg'])$$,
  '23514', null, 'photo hors de son dossier refusée'
);
select throws_ok(
  $$insert into public.knit_patterns (title, photos) values ('PDF', array['11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000013.pdf'])$$,
  '23514', null, 'photo : image seulement'
);
select throws_ok(
  $$insert into public.knit_patterns (title, photos)
    select 'Trop', array_agg(format('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-%s.jpg', lpad(i::text, 12, '0'))) from generate_series(1, 11) i$$,
  '23514', null, '10 photos au plus'
);
update public.knit_patterns set notes = 'Laine fine', size = 'L' where id = (select v from ids where k = 'photos');
select is((select notes from public.knit_patterns where id = (select v from ids where k = 'photos')), 'Laine fine', 'patron modifié');
select throws_ok(
  $$update public.knit_patterns set profile_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null, 'la propriétaire ne change pas'
);

-- ---------------------------------------------------------------------------
-- Projets : rangés dans la bibliothèque
-- ---------------------------------------------------------------------------
insert into ids values ('new', public.create_knit_project(
  'Pull', 'M', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000021.pdf',
  '[{"title": "Dos", "instructions": "", "total_rows": null, "stitches": null, "sections": []}]', null, null, null
));
select is(
  (select row(t.title, t.pdf_path, t.size)::text from public.knit_patterns t join public.knit_projects p on p.pattern_id = t.id where p.id = (select v from ids where k = 'new')),
  row('Pull', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000021.pdf', 'M')::text,
  'nouveau projet : son patron est rangé dans la bibliothèque'
);

-- Patron sans PDF commencé avec un PDF : il le garde.
insert into ids values ('from-photos', public.create_knit_project(
  'Châle', 'Unique', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000022.pdf',
  '[{"title": "Bordure", "instructions": "", "total_rows": null, "stitches": null, "sections": []}]', null, null, (select v from ids where k = 'photos')
));
select is(
  (select pdf_path from public.knit_patterns where id = (select v from ids where k = 'photos')),
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000022.pdf',
  'patron commencé : il prend le PDF du projet'
);
select is((select pattern_id from public.knit_projects where id = (select v from ids where k = 'from-photos')), (select v from ids where k = 'photos'), 'projet relié à son patron');

-- Deuxième projet du même patron avec un autre PDF : le patron garde le sien.
select public.create_knit_project(
  'Châle bis', 'Unique', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000023.pdf',
  '[{"title": "Bordure", "instructions": "", "total_rows": null, "stitches": null, "sections": []}]', null, null, (select v from ids where k = 'photos')
);
select is(
  (select row(t.pdf_path, (select count(*) from public.knit_projects p where p.pattern_id = t.id))::text from public.knit_patterns t where t.id = (select v from ids where k = 'photos')),
  row('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000022.pdf', 2::bigint)::text,
  'un patron, plusieurs projets ; il garde son PDF'
);
select throws_ok(
  format($$update public.knit_projects set pattern_id = null where id = %L$$, (select v from ids where k = 'new')),
  '42501', null, 'le patron d''un projet ne se change pas à la main'
);

-- ---------------------------------------------------------------------------
-- Chacun sa bibliothèque
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_patterns), 0, 'patrons de chacun');
select throws_ok(
  format($$select public.create_knit_project('Pirate', 'S', null, '[{"title": "Dos"}]', null, null, %L)$$, (select v from ids where k = 'photos')),
  '42501', null, 'pas de projet depuis le patron d''une autre'
);

-- ---------------------------------------------------------------------------
-- Suppression et ménage de nuit
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
delete from public.knit_patterns where id = (select v from ids where k = 'photos');
select is(
  (select count(*)::int from public.knit_projects where pattern_id is null and title like 'Châle%'),
  2, 'patron supprimé : ses projets restent'
);
reset role;

insert into public.knit_patterns (profile_id, title, photos)
values ('11111111-1111-1111-1111-111111111111', 'Bonnet', array['11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000031.jpg']);
select ok(
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000031.jpg' in (select public.referenced_files('knit-photos')),
  'photos des patrons gardées'
);
select ok(
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000021.pdf' in (select public.referenced_files('knit-patterns')),
  'PDF des patrons gardés'
);

select * from finish();
rollback;
