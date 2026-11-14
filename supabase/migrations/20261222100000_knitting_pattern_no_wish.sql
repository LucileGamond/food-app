-- Bibliothèque de patrons : plus d'envie (bientôt, un jour, peut-être). Un patron se distingue seulement par ses projets.

-- La fonction de création d'un projet ne remplit plus l'envie : elle est remplacée avant que la colonne parte.
create or replace function public.create_knit_project(
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
    -- Nouveau patron : rangé dans la bibliothèque.
    insert into public.knit_patterns (profile_id, title, pdf_path, size)
    values (auth.uid(), btrim(p_title), p_pdf_path, nullif(btrim(p_size), ''))
    returning id into v_pattern;
  else
    -- Patron de la bibliothèque : il garde son PDF ; il prend celui du projet s'il n'en avait pas.
    update public.knit_patterns
    set pdf_path = coalesce(pdf_path, p_pdf_path)
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

alter table public.knit_patterns drop column wish;
