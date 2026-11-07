begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

delete from public.knit_projects;
delete from public.knit_queue;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Laines : bornes
-- ---------------------------------------------------------------------------
select ok(public.knit_yarns_are_valid('[]'), 'aucune laine');
select ok(public.knit_yarns_are_valid('[{"brand": "Phildar", "weight_g": 50, "length_m": 125, "skeins": 2.5, "needle_mm": 3.5, "color": null}]'), 'laine complète');
select ok(not public.knit_yarns_are_valid('[{"brand": "x"}, {}, {}, {}, {}, {}, {}]'), '6 laines au plus');
select ok(not public.knit_yarns_are_valid('[{"prix": 3}]'), 'champ inconnu refusé');
select ok(not public.knit_yarns_are_valid('[{"brand": 3}]'), 'texte attendu');
select ok(not public.knit_yarns_are_valid(jsonb_build_array(jsonb_build_object('name', repeat('x', 81)))), 'texte de 80 caractères au plus');
select ok(not public.knit_yarns_are_valid('[{"weight_g": 50.5}]'), 'poids entier');
select ok(not public.knit_yarns_are_valid('[{"skeins": 2.3}]'), 'pelotes par demi');
select ok(not public.knit_yarns_are_valid('[{"needle_mm": 40}]'), 'aiguilles bornées');
select ok(not public.knit_yarns_are_valid('{"brand": "x"}'), 'une liste');

-- ---------------------------------------------------------------------------
-- Projet : laine et échantillons, création depuis un patron en attente
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

with q as (
  insert into public.knit_queue (title, pdf_path, size, priority)
  values ('Gilet', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.pdf', 'M', 1)
  returning id
)
insert into ids select 'queued', id from q;
select throws_ok(
  $$insert into public.knit_queue (title, pdf_path) values ('Volé', '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000002.pdf')$$,
  '42501', null, 'PDF hors de son dossier refusé'
);
select throws_ok($$insert into public.knit_queue (title, url) values ('Lien', 'ftp://patrons')$$, '23514', null, 'lien http(s) seulement');
select throws_ok($$insert into public.knit_queue (title, priority) values ('Bonnet', 4)$$, '23514', null, 'priorité de 1 à 3');

insert into ids values ('project', public.create_knit_project(
  'Gilet', 'M', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.pdf',
  '[{"title": "Dos", "instructions": "", "total_rows": 10, "stitches": 64, "sections": []}]',
  22, 30, (select v from ids where k = 'queued')
));
select is(
  (select row(pattern_gauge_stitches, pattern_gauge_rows, pdf_path)::text from public.knit_projects where id = (select v from ids where k = 'project')),
  row(22.0::numeric(4, 1), 30.0::numeric(4, 1), '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.pdf')::text,
  'échantillon du patron et PDF repris'
);
select is((select count(*)::int from public.knit_queue), 0, 'patron commencé : il quitte la liste');

update public.knit_projects set yarns = '[{"brand": "Phildar", "skeins": 6}]', my_gauge_stitches = 24, my_gauge_rows = 27
where id = (select v from ids where k = 'project');
select is((select my_gauge_stitches from public.knit_projects), 24.0::numeric(4, 1), 'échantillon de la tricoteuse enregistré');
select throws_ok($$update public.knit_projects set yarns = '[{"skeins": -1}]'$$, '23514', null, 'laine invalide refusée');
select throws_ok($$update public.knit_projects set my_gauge_rows = 0$$, '23514', null, 'échantillon borné');

-- Patron en attente pour la suite
insert into public.knit_queue (title, pdf_path) values ('Bonnet', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000003.pdf');

-- Eric ne voit ni les projets ni les patrons de Lucile.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_queue), 0, 'patrons en attente de chacun');
select is(
  public.create_knit_project('Pirate', 'S', null, '[{"title": "Dos", "instructions": "", "total_rows": null, "stitches": null, "sections": []}]', null, null,
    (select id from public.knit_queue limit 1)) is not null,
  true, 'projet créé sans toucher aux patrons des autres'
);
reset role;
select is((select count(*)::int from public.knit_queue), 1, 'le patron de Lucile reste');

-- Ménage de nuit : le PDF d'un patron en attente est gardé.
select ok(
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000003.pdf' in (select public.referenced_files('knit-patterns')),
  'PDF des patrons en attente gardé'
);

select * from finish();
rollback;
