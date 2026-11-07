-- Tricot : laine du projet, échantillon, et patrons à faire plus tard.
--
--   knit_projects.yarns           laines utilisées (jusqu'à 6) : marque, nom, coloris, bain, composition, poids,
--                                 métrage, pelotes, aiguilles ; remplissables d'après la photo de l'étiquette
--   knit_projects.pattern_gauge_* échantillon du patron (mailles et rangs pour 10 cm), lu avec le patron
--   knit_projects.my_gauge_*      échantillon de la tricoteuse : mailles et rangs des étapes recalculés à l'écran
--   knit_queue                    patrons en attente (PDF ou lien), « Commencer » en fait un projet
--
-- Chacun ne voit que les siens, comme les projets.

-- ---------------------------------------------------------------------------
-- Laine et échantillon du projet
-- ---------------------------------------------------------------------------

-- [{ "brand", "name", "color", "dye_lot", "composition" (textes de 80 car. au plus),
--    "weight_g" (1-1000), "length_m" (1-5000), "skeins" (0-200, par demi), "needle_mm" (1-30) }], champs facultatifs.
create function public.knit_yarns_are_valid(p_yarns jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_yarns) = 'array'
    and jsonb_array_length(p_yarns) <= 6
    and not exists (
      select 1
      from jsonb_array_elements(p_yarns) y
      where jsonb_typeof(y) <> 'object'
        or exists (
          select 1 from jsonb_each(y) f
          where f.key not in ('brand', 'name', 'color', 'dye_lot', 'composition', 'weight_g', 'length_m', 'skeins', 'needle_mm')
        )
        or exists (
          select 1 from jsonb_each(y) f
          where f.key in ('brand', 'name', 'color', 'dye_lot', 'composition')
            and jsonb_typeof(f.value) <> 'null'
            and (jsonb_typeof(f.value) <> 'string' or char_length(f.value #>> '{}') > 80)
        )
        or exists (
          select 1 from jsonb_each(y) f
          where f.key in ('weight_g', 'length_m', 'skeins', 'needle_mm')
            and jsonb_typeof(f.value) <> 'null'
            and (
              jsonb_typeof(f.value) <> 'number'
              or (f.key = 'weight_g' and (f.value::numeric not between 1 and 1000 or f.value::numeric % 1 <> 0))
              or (f.key = 'length_m' and (f.value::numeric not between 1 and 5000 or f.value::numeric % 1 <> 0))
              or (f.key = 'skeins' and (f.value::numeric not between 0 and 200 or f.value::numeric % 0.5 <> 0))
              or (f.key = 'needle_mm' and f.value::numeric not between 1 and 30)
            )
        )
    );
$$;

alter table public.knit_projects
  add column yarns jsonb not null default '[]' check (public.knit_yarns_are_valid(yarns)),
  add column pattern_gauge_stitches numeric(4, 1) check (pattern_gauge_stitches between 1 and 100),
  add column pattern_gauge_rows numeric(4, 1) check (pattern_gauge_rows between 1 and 100),
  add column my_gauge_stitches numeric(4, 1) check (my_gauge_stitches between 1 and 100),
  add column my_gauge_rows numeric(4, 1) check (my_gauge_rows between 1 and 100);

grant update (yarns, pattern_gauge_stitches, pattern_gauge_rows, my_gauge_stitches, my_gauge_rows) on public.knit_projects to authenticated;

-- Un projet créé depuis un patron en attente garde son échantillon et son PDF.
create function public.create_knit_project(
  p_title text,
  p_size text,
  p_pdf_path text,
  p_steps jsonb,
  p_pattern_gauge_stitches numeric,
  p_pattern_gauge_rows numeric,
  p_queue_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.create_knit_project(p_title, p_size, p_pdf_path, p_steps);
  update public.knit_projects
  set pattern_gauge_stitches = p_pattern_gauge_stitches, pattern_gauge_rows = p_pattern_gauge_rows
  where id = v_id;
  -- Patron en attente commencé : il quitte la liste (son PDF passe au projet).
  if p_queue_id is not null then
    delete from public.knit_queue where id = p_queue_id and profile_id = auth.uid();
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Patrons à faire plus tard
-- ---------------------------------------------------------------------------

create table public.knit_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  -- PDF dans le bucket knit-patterns (dossier de la personne), ou lien vers le patron.
  pdf_path text check (pdf_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.pdf$'),
  url text check (url ~* '^https?://' and char_length(url) <= 2000),
  size text check (size is null or (btrim(size) <> '' and char_length(size) <= 40)),
  yarn_idea text not null default '' check (char_length(yarn_idea) <= 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  -- 1 = bientôt, 2 = un jour, 3 = peut-être
  priority smallint not null default 2 check (priority between 1 and 3),
  created_at timestamptz not null default now()
);
create index knit_queue_profile_idx on public.knit_queue (profile_id, priority, created_at);

alter table public.knit_queue enable row level security;
create policy "mes patrons en attente" on public.knit_queue for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and (pdf_path is null or split_part(pdf_path, '/', 1) = auth.uid()::text));
revoke all on public.knit_queue from anon, authenticated;
grant select, delete on public.knit_queue to authenticated;
grant insert (title, pdf_path, url, size, yarn_idea, notes, priority) on public.knit_queue to authenticated;
grant update (title, url, size, yarn_idea, notes, priority) on public.knit_queue to authenticated;

revoke execute on function public.create_knit_project(text, text, text, jsonb, numeric, numeric, uuid) from public, anon;
grant execute on function public.create_knit_project(text, text, text, jsonb, numeric, numeric, uuid) to authenticated;

-- Le ménage de nuit garde aussi les PDF des patrons en attente.
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
  select storage_path from public.plant_photos where p_bucket = 'plant-photos'
$$;
