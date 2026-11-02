-- Tricot : une étape devient une suite de sections, dans l'ordre, réglables par la tricoteuse :
--   { "kind": "rows",   "rows": 4,    "every": null, "times": null, "text": "jersey",       "pattern": null }
--   { "kind": "repeat", "rows": null, "every": 8,    "times": 3,    "text": "1 diminution", "pattern": "tous les 5 cm" }
-- « tous les 5 cm » → « tous les 8 rangs » selon sa laine (every à null tant que ce n'est pas réglé).

-- Anciens rappels { every, first, times, action } : premier rang décalé → section de rangs avant la répétition.
update public.knit_steps s
set reminders = coalesce((
  select jsonb_agg(x.section order by r.ord, x.part)
  from jsonb_array_elements(s.reminders) with ordinality as r(rem, ord)
  cross join lateral (
    select 1 as part,
      jsonb_build_object('kind', 'rows', 'rows', (rem ->> 'first')::integer - (rem ->> 'every')::integer, 'every', null, 'times', null, 'text', '', 'pattern', null) as section
    where (rem ->> 'first') is not null and (rem ->> 'every') is not null and (rem ->> 'first')::integer > (rem ->> 'every')::integer
    union all
    select 2,
      jsonb_build_object('kind', 'repeat', 'rows', null, 'every', rem -> 'every', 'times', rem -> 'times', 'text', coalesce(rem ->> 'action', ''), 'pattern', rem -> 'pattern')
  ) as x
), '[]'::jsonb);

alter table public.knit_steps rename column reminders to sections;
alter table public.knit_steps add constraint knit_steps_sections_count check (jsonb_array_length(sections) <= 30);
grant update (sections) on public.knit_steps to authenticated;

-- p_steps : [{ title, instructions, total_rows, stitches, sections }]
create or replace function public.create_knit_project(p_title text, p_size text, p_pdf_path text, p_steps jsonb)
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

  insert into public.knit_steps (project_id, position, title, instructions, total_rows, stitches, sections)
  select v_id, (s.ord - 1)::integer, btrim(s.step ->> 'title'), coalesce(s.step ->> 'instructions', ''),
    (s.step ->> 'total_rows')::integer, (s.step ->> 'stitches')::integer, coalesce(s.step -> 'sections', '[]'::jsonb)
  from jsonb_array_elements(p_steps) with ordinality as s(step, ord);

  return v_id;
end;
$$;
