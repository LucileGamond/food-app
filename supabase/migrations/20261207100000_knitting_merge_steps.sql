-- Tricot : regrouper une étape avec la suivante (« Dos – côtes » + « Dos – jersey » → « Dos » et ses sous-étapes).
--
-- Les sous-étapes et le nombre de rangs regroupés sont calculés par l'application (rangs « en même temps » décalés) ;
-- la fonction fait le reste d'un coup : textes mis bout à bout, diagrammes et photos rattachés à l'étape gardée,
-- étape suivante supprimée, positions renumérotées. Refusé si l'étape suivante est commencée (son compteur serait
-- perdu) ou si le projet a une adaptation (elle vise les étapes d'origine).

create function public.merge_knit_steps(p_step uuid, p_sections jsonb, p_total_rows integer)
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
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) > 60 then
    raise exception 'Sous-étapes invalides' using errcode = '22023';
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
    times = greatest(v_first.times, v_next.times),
    sections = p_sections
  where id = v_first.id;

  update public.knit_charts set step_id = v_first.id where step_id = v_next.id;
  update public.knit_progress_photos set step_id = v_first.id where step_id = v_next.id;
  delete from public.knit_steps where id = v_next.id;
  -- Positions renumérotées en deux temps (position unique dans le projet).
  update public.knit_steps set position = position + 100000 where project_id = v_first.project_id and position > v_next.position;
  update public.knit_steps set position = position - 100001 where project_id = v_first.project_id and position > 100000;
end;
$$;

revoke execute on function public.merge_knit_steps(uuid, jsonb, integer) from public, anon;
grant execute on function public.merge_knit_steps(uuid, jsonb, integer) to authenticated;
