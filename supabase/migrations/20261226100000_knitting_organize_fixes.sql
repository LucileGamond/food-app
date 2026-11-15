-- Tricot : regrouper, séparer et lectures gardées, rendus sûrs côté base.
--
-- Regrouper (merge_knit_steps) refuse aussi :
--   - une étape terminée (la suivante passerait pour tricotée) ;
--   - deux étapes qui ne se tricotent pas le même nombre de fois (la plus grande s'appliquait aux deux) ;
--   - plus de 30 sous-étapes (la limite de knit_steps ; l'erreur était une contrainte sans explication).
-- Un diagramme de l'étape suivante qui n'est pas rattaché à une sous-étape garde ses rangs : ils sont décalés des rangs
-- de la première étape (il s'affichait au début de l'étape regroupée).
--
-- Séparer (split_knit_step) : un diagramme non rattaché qui commence après la coupure part dans la nouvelle étape, à
-- son rang dans celle-ci (il restait au-delà de la fin de la première).
--
-- Lectures gardées : quand le PDF d'un patron est remplacé par un autre, ses lectures (faites sur l'ancien) sont
-- oubliées ; un nouveau projet ne reprend plus les étapes de l'ancien PDF. Retirer le PDF les garde (même patron).

create or replace function public.merge_knit_steps(p_step uuid, p_sections jsonb, p_total_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first public.knit_steps;
  v_next public.knit_steps;
  v_adaptation jsonb;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  select s.* into v_first from public.knit_steps s
    join public.knit_projects p on p.id = s.project_id and p.profile_id = auth.uid()
    where s.id = p_step
    for update of s;
  if not found then
    raise exception 'Étape introuvable' using errcode = 'P0002';
  end if;
  select s.* into v_next from public.knit_steps s
    where s.project_id = v_first.project_id and s.position = v_first.position + 1
    for update;
  if not found then
    raise exception 'Pas d’étape après celle-ci' using errcode = '22023';
  end if;
  if v_next.row_count > 0 or v_next.done or v_next.pass > 1 then
    raise exception 'L’étape suivante est commencée : impossible de la regrouper' using errcode = '22023';
  end if;
  select adaptation into v_adaptation from public.knit_projects where id = v_first.project_id;
  if v_adaptation is not null then
    raise exception 'Le patron a une adaptation : supprime-la avant de regrouper des étapes' using errcode = '22023';
  end if;
  if v_first.done then
    raise exception 'Cette étape est terminée : impossible de la regrouper avec la suivante' using errcode = '22023';
  end if;
  if v_first.times <> v_next.times then
    raise exception 'Les deux étapes ne se tricotent pas le même nombre de fois' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) > 30 then
    raise exception 'Sous-étapes invalides (30 au plus)' using errcode = '22023';
  end if;

  update public.knit_steps set
    instructions = concat_ws(e'\n\n', nullif(v_first.instructions, ''), nullif(v_next.instructions, '')),
    translation = case
      when v_first.translation is null and v_next.translation is null then null
      else concat_ws(e'\n\n', coalesce(v_first.translation, v_first.instructions), coalesce(v_next.translation, v_next.instructions))
    end,
    notes = concat_ws(e'\n\n', nullif(v_first.notes, ''), nullif(v_next.notes, '')),
    total_rows = p_total_rows,
    stitches = coalesce(v_next.stitches, v_first.stitches),
    times = v_first.times,
    sections = p_sections
  where id = v_first.id;

  -- Diagrammes non rattachés à une sous-étape : leurs rangs suivent, décalés des rangs de la première étape (quand on
  -- les connaît). Les rattachés se recalculent d'après leur sous-étape.
  update public.knit_charts set
    step_id = v_first.id,
    start_row = case when section_id is null and v_first.total_rows is not null then least(start_row + v_first.total_rows, 5000) else start_row end,
    end_row = case when section_id is null and v_first.total_rows is not null and end_row is not null then least(end_row + v_first.total_rows, 5000) else end_row end
  where step_id = v_next.id;
  update public.knit_progress_photos set step_id = v_first.id where step_id = v_next.id;
  delete from public.knit_steps where id = v_next.id;
  -- Positions renumérotées en deux temps (position unique dans le projet).
  update public.knit_steps set position = position + 100000 where project_id = v_first.project_id and position > v_next.position;
  update public.knit_steps set position = position - 100001 where project_id = v_first.project_id and position > 100000;
end;
$$;

create or replace function public.split_knit_step(
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
    or jsonb_array_length(p_sections) > 30 or jsonb_array_length(p_new_sections) > 30 then
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

  -- Diagrammes non rattachés qui commencent après la coupure : dans la nouvelle étape, à leur rang dans celle-ci.
  if p_total_rows is not null then
    update public.knit_charts set
      step_id = v_id,
      start_row = start_row - p_total_rows,
      end_row = end_row - p_total_rows
    where step_id = v_step.id and section_id is null and start_row > p_total_rows;
  end if;
  return v_id;
end;
$$;

create function public.knit_patterns_forget_readings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.knit_pattern_readings where pattern_id = new.id;
  return null;
end;
$$;

create trigger knit_patterns_forget_readings
  after update of pdf_path on public.knit_patterns
  for each row
  when (old.pdf_path is not null and new.pdf_path is not null and old.pdf_path <> new.pdf_path)
  execute function public.knit_patterns_forget_readings();

revoke execute on function public.knit_patterns_forget_readings from public, anon, authenticated;
