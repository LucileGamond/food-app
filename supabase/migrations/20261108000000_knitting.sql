-- Module Tricot (indépendant de la cuisine) : patrons PDF découpés en étapes pour une taille, avec compteur de rangs,
-- notes et rappels (« 2 diminutions tous les 6 rangs »). Chacun ne voit que ses projets.
--
--   knit_projects   un patron suivi pour une taille (PDF d'origine dans le bucket privé knit-patterns)
--   knit_steps      étapes dans l'ordre : consignes de la taille choisie, rangs comptés, notes, rappels

create table public.knit_projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  size text not null check (btrim(size) <> '' and char_length(size) <= 40),
  pdf_path text check (pdf_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.pdf$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knit_projects_profile_idx on public.knit_projects (profile_id, updated_at desc);

create table public.knit_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.knit_projects on delete cascade,
  position integer not null check (position >= 0),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  instructions text not null default '' check (char_length(instructions) <= 5000),
  total_rows integer check (total_rows between 1 and 2000),
  stitches integer check (stitches between 1 and 5000),
  -- [{ "every": 6, "first": 6, "times": 4, "action": "2 diminutions" }]
  reminders jsonb not null default '[]' check (jsonb_typeof(reminders) = 'array'),
  row_count integer not null default 0 check (row_count between 0 and 5000),
  notes text not null default '' check (char_length(notes) <= 5000),
  done boolean not null default false,
  unique (project_id, position)
);

alter table public.knit_projects enable row level security;
create policy "mes projets" on public.knit_projects for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.knit_projects from anon, authenticated;
grant select, insert, delete on public.knit_projects to authenticated;
grant update (title, updated_at) on public.knit_projects to authenticated;

alter table public.knit_steps enable row level security;
create policy "étapes de mes projets" on public.knit_steps for all to authenticated
  using (exists (select 1 from public.knit_projects p where p.id = project_id and p.profile_id = auth.uid()))
  with check (exists (select 1 from public.knit_projects p where p.id = project_id and p.profile_id = auth.uid()));
revoke all on public.knit_steps from anon, authenticated;
grant select on public.knit_steps to authenticated;
-- Seule l'avancée se modifie ; les étapes sont créées avec le projet.
grant update (row_count, notes, done) on public.knit_steps to authenticated;

-- Avancée enregistrée : le projet remonte en tête de liste.
create function public.touch_knit_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.knit_projects set updated_at = now() where id = new.project_id;
  return null;
end;
$$;
create trigger knit_steps_touch_project after update on public.knit_steps
  for each row execute function public.touch_knit_project();
revoke execute on function public.touch_knit_project from public, anon, authenticated;

-- Crée un projet et ses étapes en une fois.
-- p_steps : [{ title, instructions, total_rows, stitches, reminders }]
create function public.create_knit_project(p_title text, p_size text, p_pdf_path text, p_steps jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 or jsonb_array_length(p_steps) > 200 then
    raise exception 'Étapes invalides' using errcode = '22023';
  end if;
  -- Le PDF doit être dans le dossier de la personne connectée.
  if p_pdf_path is not null and split_part(p_pdf_path, '/', 1) <> auth.uid()::text then
    raise exception 'PDF invalide' using errcode = '42501';
  end if;

  insert into public.knit_projects (profile_id, title, size, pdf_path)
  values (auth.uid(), btrim(p_title), btrim(p_size), p_pdf_path)
  returning id into v_id;

  insert into public.knit_steps (project_id, position, title, instructions, total_rows, stitches, reminders)
  select v_id, (s.ord - 1)::integer, btrim(s.step ->> 'title'), coalesce(s.step ->> 'instructions', ''),
    (s.step ->> 'total_rows')::integer, (s.step ->> 'stitches')::integer, coalesce(s.step -> 'reminders', '[]'::jsonb)
  from jsonb_array_elements(p_steps) with ordinality as s(step, ord);

  return v_id;
end;
$$;
revoke execute on function public.create_knit_project from public, anon;
grant execute on function public.create_knit_project to authenticated;

-- PDF d'origine : dossier par personne (<uid>/<uuid>.pdf), 20 Mo au plus.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knit-patterns', 'knit-patterns', false, 20971520, array['application/pdf']);

create policy "mes patrons : lecture" on storage.objects
  for select to authenticated using (bucket_id = 'knit-patterns' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "mes patrons : ajout" on storage.objects
  for insert to authenticated with check (bucket_id = 'knit-patterns' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "mes patrons : suppression" on storage.objects
  for delete to authenticated using (bucket_id = 'knit-patterns' and (storage.foldername(name))[1] = auth.uid()::text);

-- Nouvelle page dans les réglages, masquée tant que la personne ne l'a pas activée.
alter table public.user_settings drop constraint user_settings_disabled_pages_check;
alter table public.user_settings add constraint user_settings_disabled_pages_check
  check (disabled_pages <@ array['planning', 'recettes', 'plan', 'courses', 'poids', 'hydratation', 'tricot']);
alter table public.user_settings alter column disabled_pages set default '{hydratation,tricot}';
update public.user_settings set disabled_pages = array_append(disabled_pages, 'tricot') where not ('tricot' = any (disabled_pages));
