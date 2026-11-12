-- Tricot : le texte du patron suit les sous-étapes quand on organise les étapes.
--
-- Chaque sous-étape garde son extrait du texte (sections[].source) ; le texte de l'étape est leur réunion, calculée
-- par l'application. Organiser les étapes enregistre donc aussi le texte. Quand le texte d'une étape change, ses
-- nombres corrigés à la main (positions dans le texte) et sa traduction ne correspondent plus : ils sont effacés.

drop function public.set_knit_sections(jsonb);
drop function public.split_knit_step(uuid, jsonb, integer, text, jsonb, integer);

-- [{ "id": "…", "sections": [...], "total_rows": 40 | null, "instructions": "…" }]
create function public.set_knit_sections(p_steps jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) not between 1 and 10 then
    raise exception 'Étapes invalides' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_steps) e
    where jsonb_typeof(e -> 'sections') <> 'array' or jsonb_array_length(e -> 'sections') > 60 or jsonb_typeof(e -> 'instructions') <> 'string'
  ) then
    raise exception 'Sous-étapes invalides' using errcode = '22023';
  end if;
  select count(*), min(s.project_id::text)::uuid into v_count, v_project
    from public.knit_steps s
    join public.knit_projects p on p.id = s.project_id and p.profile_id = auth.uid()
    where s.id in (select (e ->> 'id')::uuid from jsonb_array_elements(p_steps) e);
  if v_count <> jsonb_array_length(p_steps) then
    raise exception 'Étape introuvable' using errcode = 'P0002';
  end if;
  if (select count(distinct s.project_id) from public.knit_steps s where s.id in (select (e ->> 'id')::uuid from jsonb_array_elements(p_steps) e)) > 1 then
    raise exception 'Étapes de projets différents' using errcode = '22023';
  end if;
  if exists (select 1 from public.knit_steps s where s.id in (select (e ->> 'id')::uuid from jsonb_array_elements(p_steps) e) and (s.row_count > 0 or s.done or s.pass > 1)) then
    raise exception 'Une étape commencée ne peut pas être réorganisée' using errcode = '22023';
  end if;
  if (select adaptation from public.knit_projects where id = v_project) is not null then
    raise exception 'Le patron a une adaptation : supprime-la avant d’organiser les étapes' using errcode = '22023';
  end if;

  update public.knit_steps s set
    sections = e -> 'sections',
    total_rows = (e ->> 'total_rows')::integer,
    instructions = e ->> 'instructions',
    highlights = case when s.instructions = e ->> 'instructions' then s.highlights else '{}' end,
    translation = case when s.instructions = e ->> 'instructions' then s.translation end
  from jsonb_array_elements(p_steps) e
  where s.id = (e ->> 'id')::uuid;
end;
$$;

-- Sépare une étape : elle garde ses premières sous-étapes et leur texte, une nouvelle étape juste après reçoit la suite.
create function public.split_knit_step(
  p_step uuid, p_sections jsonb, p_total_rows integer, p_instructions text,
  p_new_title text, p_new_sections jsonb, p_new_total_rows integer, p_new_instructions text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.knit_steps;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  select s.* into v_step from public.knit_steps s
    join public.knit_projects p on p.id = s.project_id and p.profile_id = auth.uid()
    where s.id = p_step
    for update of s;
  if not found then
    raise exception 'Étape introuvable' using errcode = 'P0002';
  end if;
  if v_step.row_count > 0 or v_step.done or v_step.pass > 1 then
    raise exception 'Une étape commencée ne peut pas être séparée' using errcode = '22023';
  end if;
  if (select adaptation from public.knit_projects where id = v_step.project_id) is not null then
    raise exception 'Le patron a une adaptation : supprime-la avant d’organiser les étapes' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_typeof(p_new_sections) <> 'array' or jsonb_array_length(p_new_sections) = 0
    or jsonb_array_length(p_sections) > 60 or jsonb_array_length(p_new_sections) > 60 then
    raise exception 'Sous-étapes invalides' using errcode = '22023';
  end if;

  update public.knit_steps set position = position + 100000 where project_id = v_step.project_id and position > v_step.position;
  update public.knit_steps set position = position - 99999 where project_id = v_step.project_id and position > 100000;

  update public.knit_steps set
    sections = p_sections,
    total_rows = p_total_rows,
    stitches = null,
    instructions = coalesce(p_instructions, ''),
    highlights = case when instructions = coalesce(p_instructions, '') then highlights else '{}' end,
    translation = case when instructions = coalesce(p_instructions, '') then translation end
  where id = v_step.id;
  insert into public.knit_steps (project_id, position, title, instructions, total_rows, stitches, sections, times)
  values (v_step.project_id, v_step.position + 1, btrim(p_new_title), coalesce(p_new_instructions, ''), p_new_total_rows, v_step.stitches, p_new_sections, v_step.times)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.set_knit_sections(jsonb) from public, anon;
grant execute on function public.set_knit_sections(jsonb) to authenticated;
revoke execute on function public.split_knit_step(uuid, jsonb, integer, text, text, jsonb, integer, text) from public, anon;
grant execute on function public.split_knit_step(uuid, jsonb, integer, text, text, jsonb, integer, text) to authenticated;
