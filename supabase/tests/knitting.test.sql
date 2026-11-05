begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

delete from public.knit_projects;

set local role anon;
select throws_ok('select count(*) from public.knit_projects', '42501', null, 'anon ne lit pas les projets');
select throws_ok(
  $$select public.create_knit_project('Pull', 'M', null, '[{"title": "Dos"}]')$$, '42501', null, 'anon ne crée pas de projet'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$select public.create_knit_project(
    'Pull Bergamote', 'M', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.pdf',
    '[{"title": "Dos – côtes", "instructions": "Monter 64 m.", "total_rows": 18, "stitches": 64},
      {"title": "Emmanchures", "instructions": "Diminuer", "total_rows": 30,
       "sections": [{"kind": "repeat", "rows": null, "every": 6, "times": 4, "text": "1 diminution", "pattern": null}]}]'
  )$$,
  'projet créé avec ses étapes'
);
select results_eq(
  $$select position, title, total_rows, stitches, jsonb_array_length(sections) from public.knit_steps order by position$$,
  $$values (0, 'Dos – côtes', 18, 64, 0), (1, 'Emmanchures', 30, null, 1)$$,
  'étapes dans l''ordre, avec rangs, mailles et sections'
);
select throws_ok(
  $$select public.create_knit_project('Pull', 'M', null, '[]')$$, '22023', null, 'au moins une étape'
);
select throws_ok(
  $$select public.create_knit_project('Pull', 'M', '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000002.pdf', '[{"title": "Dos"}]')$$,
  '42501', null, 'PDF hors de son dossier refusé'
);
select throws_ok(
  $$select public.create_knit_project('Pull', ' ', null, '[{"title": "Dos"}]')$$, '23514', null, 'taille requise'
);

-- Avancée
update public.knit_projects set updated_at = now() - interval '1 day';
update public.knit_steps set row_count = 6, notes = 'Aiguilles 4', done = false where position = 1;
select is((select row_count from public.knit_steps where position = 1), 6, 'rangs enregistrés');
select ok((select updated_at > now() - interval '1 minute' from public.knit_projects), 'projet remonté après une avancée');
select throws_ok(
  $$update public.knit_steps set row_count = -1 where position = 1$$, '23514', null, 'rangs négatifs refusés'
);
select throws_ok(
  $$update public.knit_steps set instructions = 'autre' where position = 1$$, '42501', null, 'consignes non modifiables'
);
update public.knit_steps set sections = '[{"kind": "rows", "rows": 4}, {"kind": "repeat", "every": 8, "times": 3, "text": "1 augmentation"}]' where position = 1;
select is((select jsonb_array_length(sections) from public.knit_steps where position = 1), 2, 'sections réglables');
select throws_ok(
  $$update public.knit_steps set sections = (select jsonb_agg(x) from generate_series(1, 31) x) where position = 1$$, '23514', null, '30 sections au plus'
);

-- Eric ne voit pas les projets de Lucile
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_projects), 0, 'projets de l''autre invisibles');
select is((select count(*)::int from public.knit_steps), 0, 'étapes de l''autre invisibles');
update public.knit_steps set row_count = 99;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select max(row_count) from public.knit_steps), 6, 'avancée de l''autre intouchable');

-- Suppression en cascade
delete from public.knit_projects;
select is((select count(*)::int from public.knit_steps), 0, 'étapes supprimées avec le projet');

-- Page masquée par défaut
reset role;
select is(
  (select column_default from information_schema.columns where table_name = 'user_settings' and column_name = 'disabled_pages'),
  '''{hydratation,tricot,plantes}''::text[]', 'tricot masqué par défaut'
);

select * from finish();
rollback;
