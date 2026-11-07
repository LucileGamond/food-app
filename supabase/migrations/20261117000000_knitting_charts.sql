-- Tricot : diagrammes (grilles) d'un patron, suivis rang par rang avec le compteur de l'étape.
--
--   knit_charts   image du diagramme (bucket privé knit-charts), calée sur ses rangs : bas du rang 1 et haut du
--                 dernier rang (fractions de la hauteur de l'image, 0 = haut), nombre de rangs ; rattachée à une
--                 étape, à partir d'un rang de l'étape, et répétée ou non une fois le dernier rang tricoté.
--
-- Le rang surligné se calcule à l'écran depuis le compteur de l'étape (knit_steps.row_count) : rien d'autre à enregistrer.

create table public.knit_charts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.knit_projects on delete cascade,
  step_id uuid references public.knit_steps on delete set null,
  title text not null default '' check (char_length(title) <= 100),
  image_path text not null check (image_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png)$'),
  grid_top numeric(5, 4) not null check (grid_top between 0 and 1),
  grid_bottom numeric(5, 4) not null check (grid_bottom between 0 and 1),
  rows integer not null check (rows between 1 and 500),
  -- Rang de l'étape où se tricote le rang 1 du diagramme.
  start_row integer not null default 1 check (start_row between 1 and 5000),
  repeats boolean not null default true,
  created_at timestamptz not null default now(),
  check (grid_bottom > grid_top)
);
create index knit_charts_project_idx on public.knit_charts (project_id, created_at);
create index knit_charts_step_idx on public.knit_charts (step_id);

alter table public.knit_charts enable row level security;
-- Diagramme d'un de mes projets ; son étape (s'il en a une) est du même projet ; son image dans mon dossier.
create policy "diagrammes de mes projets" on public.knit_charts for all to authenticated
  using (exists (select 1 from public.knit_projects p where p.id = project_id and p.profile_id = auth.uid()))
  with check (
    exists (select 1 from public.knit_projects p where p.id = project_id and p.profile_id = auth.uid())
    and (step_id is null or exists (select 1 from public.knit_steps s where s.id = step_id and s.project_id = knit_charts.project_id))
    and split_part(image_path, '/', 1) = auth.uid()::text
  );
revoke all on public.knit_charts from anon, authenticated;
grant select, delete on public.knit_charts to authenticated;
grant insert (project_id, step_id, title, image_path, grid_top, grid_bottom, rows, start_row, repeats) on public.knit_charts to authenticated;
grant update (step_id, title, grid_top, grid_bottom, rows, start_row, repeats) on public.knit_charts to authenticated;

-- Images des diagrammes : dossier par personne (<uid>/<uuid>.jpg), 10 Mo au plus.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knit-charts', 'knit-charts', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "mes diagrammes : lecture" on storage.objects
  for select to authenticated using (bucket_id = 'knit-charts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "mes diagrammes : ajout" on storage.objects
  for insert to authenticated with check (bucket_id = 'knit-charts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "mes diagrammes : suppression" on storage.objects
  for delete to authenticated using (bucket_id = 'knit-charts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Le ménage de nuit garde aussi les images des diagrammes.
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
  select storage_path from public.plant_photos where p_bucket = 'plant-photos'
$$;
