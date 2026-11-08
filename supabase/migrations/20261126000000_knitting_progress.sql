-- Tricot : notes et photos d'avancement d'un projet.
--
--   knit_projects.notes      notes du projet (modifications faites au patron, essais, pour qui…)
--   knit_progress_photos     photos prises au fil du projet (bucket privé knit-photos), avec une légende facultative
--                            et l'étape en cours au moment de la photo
--
-- Chacun ne voit que ses projets, comme le reste du module.

alter table public.knit_projects
  add column notes text not null default '' check (char_length(notes) <= 5000);
grant update (notes) on public.knit_projects to authenticated;

create table public.knit_progress_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.knit_projects on delete cascade,
  step_id uuid references public.knit_steps on delete set null,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$'),
  caption text not null default '' check (char_length(caption) <= 200),
  taken_at timestamptz not null default now()
);
create index knit_progress_photos_project_idx on public.knit_progress_photos (project_id, taken_at);

alter table public.knit_progress_photos enable row level security;
-- Photo d'un de mes projets ; son étape (s'il y en a une) est du même projet ; le fichier dans mon dossier.
create policy "photos de mes projets" on public.knit_progress_photos for all to authenticated
  using (exists (select 1 from public.knit_projects p where p.id = project_id and p.profile_id = auth.uid()))
  with check (
    exists (select 1 from public.knit_projects p where p.id = project_id and p.profile_id = auth.uid())
    and (step_id is null or exists (select 1 from public.knit_steps s where s.id = step_id and s.project_id = knit_progress_photos.project_id))
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );
revoke all on public.knit_progress_photos from anon, authenticated;
grant select, delete on public.knit_progress_photos to authenticated;
grant insert (project_id, step_id, storage_path, caption) on public.knit_progress_photos to authenticated;
grant update (caption) on public.knit_progress_photos to authenticated;

-- Photos : dossier par personne (<uid>/<uuid>.jpg), réduites par l'application (5 Mo au plus).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knit-photos', 'knit-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "mes photos de tricot : lecture" on storage.objects
  for select to authenticated using (bucket_id = 'knit-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "mes photos de tricot : ajout" on storage.objects
  for insert to authenticated with check (bucket_id = 'knit-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "mes photos de tricot : suppression" on storage.objects
  for delete to authenticated using (bucket_id = 'knit-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Le ménage de nuit garde aussi les photos d'avancement.
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
  select pdf_path from public.knit_queue where p_bucket = 'knit-patterns' and pdf_path is not null
  union
  select image_path from public.knit_charts where p_bucket = 'knit-charts'
  union
  select storage_path from public.knit_progress_photos where p_bucket = 'knit-photos'
  union
  select storage_path from public.plant_photos where p_bucket = 'plant-photos'
$$;
