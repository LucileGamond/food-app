-- Tricot : le nombre de fois d'une étape (les deux manches) lu dans le patron est gardé à la création du projet.
-- Même fonction qu'avant (20261109000000_knitting_sections.sql), avec times : entier de 1 à 10, 1 par défaut.

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

  insert into public.knit_steps (project_id, position, title, instructions, total_rows, stitches, sections, times)
  select v_id, (s.ord - 1)::integer, btrim(s.step ->> 'title'), coalesce(s.step ->> 'instructions', ''),
    (s.step ->> 'total_rows')::integer, (s.step ->> 'stitches')::integer, coalesce(s.step -> 'sections', '[]'::jsonb),
    -- Nombre de fois absent ou invalide : 1 (la contrainte de la table borne à 10).
    case when jsonb_typeof(s.step -> 'times') = 'number' and (s.step ->> 'times') ~ '^([1-9]|10)$' then (s.step ->> 'times')::smallint else 1 end
  from jsonb_array_elements(p_steps) with ordinality as s(step, ord);

  return v_id;
end;
$$;
