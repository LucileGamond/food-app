begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

delete from public.knit_patterns;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

set local role anon;
select throws_ok('select count(*) from public.knit_pattern_readings', '42501', null, 'anon ne voit pas les lectures');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

with p as (insert into public.knit_patterns (title, url) values ('Gilet', 'https://patrons.exemple/gilet') returning id)
insert into ids select 'gilet', id from p;

insert into public.knit_pattern_readings (pattern_id, size_index, size_label, reading)
values ((select v from ids where k = 'gilet'), 1, 'M', '{"title": "Gilet", "sizes": ["S", "M"], "steps": [{"title": "Dos"}]}');
select is((select count(*)::int from public.knit_pattern_readings), 1, 'lecture gardée');

-- Une lecture par taille : relire la même taille remplace la lecture (upsert).
insert into public.knit_pattern_readings (pattern_id, size_index, size_label, reading)
values ((select v from ids where k = 'gilet'), 1, 'M', '{"title": "Gilet relu", "sizes": ["S", "M"], "steps": []}')
on conflict (pattern_id, size_index) do update set reading = excluded.reading, read_at = now();
select is((select reading ->> 'title' from public.knit_pattern_readings), 'Gilet relu', 'même taille : lecture remplacée');

-- Taille unique (size_index null) : une seule lecture aussi.
insert into public.knit_pattern_readings (pattern_id, size_index, size_label, reading)
values ((select v from ids where k = 'gilet'), null, 'Unique', '{"title": "Gilet", "sizes": [], "steps": []}');
select throws_ok(
  format($$insert into public.knit_pattern_readings (pattern_id, size_index, size_label, reading) values (%L, null, 'Unique', '{"title": "x", "sizes": [], "steps": []}')$$, (select v from ids where k = 'gilet')),
  '23505', null, 'taille unique : une seule lecture'
);
select throws_ok(
  format($$insert into public.knit_pattern_readings (pattern_id, size_index, size_label, reading) values (%L, 2, 'L', '{"title": "x", "sizes": []}')$$, (select v from ids where k = 'gilet')),
  '23514', null, 'lecture sans étapes refusée'
);
select throws_ok(
  format($$insert into public.knit_pattern_readings (pattern_id, size_index, size_label, reading) values (%L, 30, 'XXL', '{"title": "x", "sizes": [], "steps": []}')$$, (select v from ids where k = 'gilet')),
  '23514', null, 'position de taille bornée'
);
-- Une lecture ne passe pas sur le patron d'une autre.
reset role;
with p as (insert into public.knit_patterns (profile_id, title, url) values ('22222222-2222-2222-2222-222222222222', 'Pirate', 'https://patrons.exemple/pirate') returning id)
insert into ids select 'pirate', id from p;
set local role authenticated;
select throws_ok(
  format($$update public.knit_pattern_readings set pattern_id = %L where pattern_id = %L$$, (select v from ids where k = 'pirate'), (select v from ids where k = 'gilet')),
  '42501', null, 'une lecture ne passe pas sur le patron d''une autre'
);

-- Chacun ses lectures
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.knit_pattern_readings), 0, 'lectures de chacun');
select throws_ok(
  format($$insert into public.knit_pattern_readings (pattern_id, size_index, size_label, reading) values (%L, 0, 'S', '{"title": "x", "sizes": [], "steps": []}')$$, (select v from ids where k = 'gilet')),
  '42501', null, 'pas de lecture sur le patron d''une autre'
);

-- Patron supprimé : ses lectures partent avec lui.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.knit_pattern_readings), 2, 'deux tailles lues');
delete from public.knit_patterns where id = (select v from ids where k = 'gilet');
reset role;
select is((select count(*)::int from public.knit_pattern_readings), 0, 'lectures supprimées avec le patron');

select * from finish();
rollback;
