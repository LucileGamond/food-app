-- Tricot : bibliothèque de patrons.
--
--   knit_patterns           un patron gardé, commencé ou non : PDF, photos et/ou lien, avec ce qui aide à le retrouver
--                           (taille visée, laine envisagée, métrage, aiguilles, envie, notes). Remplace knit_queue.
--   knit_projects.pattern_id  patron d'où vient le projet (un patron peut servir à plusieurs projets).
--
-- Avant, un patron « mis de côté » quittait la liste quand on le commençait : il vit désormais dans la bibliothèque,
-- avec la liste de ses projets. Chaque nouveau projet est rangé dans la bibliothèque (patron créé s'il n'en vient pas).
-- Le PDF d'un projet reste celui de son patron (même fichier) : supprimer un projet ne supprime plus le PDF.

-- ---------------------------------------------------------------------------
-- Photos d'un patron (bucket knit-photos, dossier de la personne)
-- ---------------------------------------------------------------------------

create function public.knit_pattern_photos_are_valid(p_photos text[], p_profile_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_photos) <= 10
    and not exists (
      select 1 from unnest(p_photos) as p(path)
      where path !~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$' or split_part(path, '/', 1) <> p_profile_id::text
    );
$$;

-- ---------------------------------------------------------------------------
-- Patrons
-- ---------------------------------------------------------------------------

create table public.knit_patterns (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  -- Formats : PDF (bucket knit-patterns), photos (bucket knit-photos) et/ou lien. Tous dans le dossier de la personne.
  pdf_path text check (pdf_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.pdf$'),
  photos text[] not null default '{}',
  url text check (url ~* '^https?://' and char_length(url) <= 2000),
  size text check (size is null or (btrim(size) <> '' and char_length(size) <= 40)),
  yarn_idea text not null default '' check (char_length(yarn_idea) <= 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  meters_needed integer check (meters_needed between 1 and 20000),
  needle_mm numeric(4, 2) check (needle_mm between 1 and 30),
  -- Envie de le tricoter : 1 = bientôt, 2 = un jour, 3 = peut-être ; null = pas d'envie notée (déjà commencé, simple archive).
  wish smallint check (wish between 1 and 3),
  created_at timestamptz not null default now(),
  constraint knit_patterns_pdf_owned check (pdf_path is null or split_part(pdf_path, '/', 1) = profile_id::text),
  constraint knit_patterns_photos_valid check (public.knit_pattern_photos_are_valid(photos, profile_id))
);
create index knit_patterns_profile_idx on public.knit_patterns (profile_id, created_at);

alter table public.knit_patterns enable row level security;
create policy "mes patrons" on public.knit_patterns for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.knit_patterns from anon, authenticated;
grant select, delete on public.knit_patterns to authenticated;
grant insert (title, pdf_path, photos, url, size, yarn_idea, notes, meters_needed, needle_mm, wish) on public.knit_patterns to authenticated;
grant update (title, pdf_path, photos, url, size, yarn_idea, notes, meters_needed, needle_mm, wish) on public.knit_patterns to authenticated;

alter table public.knit_projects add column pattern_id uuid references public.knit_patterns on delete set null;
create index knit_projects_pattern_idx on public.knit_projects (pattern_id);

-- ---------------------------------------------------------------------------
-- Reprise de l'existant
-- ---------------------------------------------------------------------------

-- Patrons mis de côté : mêmes identifiants (liens /tricot/nouveau?patron=<id> gardés), la priorité devient l'envie.
insert into public.knit_patterns (id, profile_id, title, pdf_path, url, size, yarn_idea, notes, meters_needed, needle_mm, wish, created_at)
select id, profile_id, title, pdf_path, url, size, yarn_idea, notes, meters_needed, needle_mm, priority, created_at
from public.knit_queue;

-- Projets : chacun range son patron dans la bibliothèque (titre, PDF, taille).
do $$
declare
  v_project record;
  v_pattern uuid;
begin
  for v_project in select id, profile_id, title, size, pdf_path, created_at from public.knit_projects where pattern_id is null loop
    insert into public.knit_patterns (profile_id, title, pdf_path, size, created_at)
    values (v_project.profile_id, v_project.title, v_project.pdf_path, left(v_project.size, 40), v_project.created_at)
    returning id into v_pattern;
    update public.knit_projects set pattern_id = v_pattern where id = v_project.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Création d'un projet : depuis un patron de la bibliothèque, ou en y rangeant un nouveau patron
-- ---------------------------------------------------------------------------

drop function public.create_knit_project(text, text, text, jsonb, numeric, numeric, uuid);

create function public.create_knit_project(
  p_title text,
  p_size text,
  p_pdf_path text,
  p_steps jsonb,
  p_pattern_gauge_stitches numeric,
  p_pattern_gauge_rows numeric,
  p_pattern_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_pattern uuid;
begin
  v_id := public.create_knit_project(p_title, p_size, p_pdf_path, p_steps);

  if p_pattern_id is null then
    -- Nouveau patron : rangé dans la bibliothèque, sans envie (il est commencé).
    insert into public.knit_patterns (profile_id, title, pdf_path, size)
    values (auth.uid(), btrim(p_title), p_pdf_path, nullif(btrim(p_size), ''))
    returning id into v_pattern;
  else
    -- Patron de la bibliothèque : il garde son PDF ; il prend celui du projet s'il n'en avait pas. Commencé, l'envie est remplie.
    update public.knit_patterns
    set pdf_path = coalesce(pdf_path, p_pdf_path), wish = null
    where id = p_pattern_id and profile_id = auth.uid()
    returning id into v_pattern;
    if v_pattern is null then
      raise exception 'Patron introuvable' using errcode = '42501';
    end if;
  end if;

  update public.knit_projects
  set pattern_gauge_stitches = p_pattern_gauge_stitches, pattern_gauge_rows = p_pattern_gauge_rows, pattern_id = v_pattern
  where id = v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_knit_project(text, text, text, jsonb, numeric, numeric, uuid) from public, anon;
grant execute on function public.create_knit_project(text, text, text, jsonb, numeric, numeric, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ménage de nuit : PDF et photos des patrons gardés ; la file d'attente disparaît
-- ---------------------------------------------------------------------------

create or replace function public.referenced_files(p_bucket text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select storage_path from public.recipe_photos where p_bucket = 'recipe-photos'
  union
  select unnest(photos) from public.planning_inbox where p_bucket = 'recipe-photos'
  union
  select pdf_path from public.knit_projects where p_bucket = 'knit-patterns' and pdf_path is not null
  union
  select pdf_path from public.knit_patterns where p_bucket = 'knit-patterns' and pdf_path is not null
  union
  select unnest(photos) from public.knit_patterns where p_bucket = 'knit-photos'
  union
  select image_path from public.knit_charts where p_bucket = 'knit-charts'
  union
  select storage_path from public.knit_progress_photos where p_bucket = 'knit-photos'
  union
  select storage_path from public.plant_photos where p_bucket = 'plant-photos'
$$;

drop table public.knit_queue;
