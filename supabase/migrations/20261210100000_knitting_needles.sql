-- Tricot : les aiguilles du patron (en mm), lues à l'import et modifiables. Chaque sous-étape choisit la sienne
-- (sections[].needle), héritée de la précédente ; le mode tricoter rappelle quand en changer.
--
-- Projets d'avant : les aiguilles notées sur leurs laines servent de départ.

alter table public.knit_projects
  add column needles jsonb not null default '[]'
    check (jsonb_typeof(needles) = 'array' and jsonb_array_length(needles) <= 10);

update public.knit_projects p set needles = coalesce((
  select jsonb_agg(distinct (y ->> 'needle_mm')::numeric order by (y ->> 'needle_mm')::numeric)
  from jsonb_array_elements(p.yarns) y
  where jsonb_typeof(y -> 'needle_mm') = 'number' and (y ->> 'needle_mm')::numeric between 0.5 and 30
), '[]');

grant update (needles) on public.knit_projects to authenticated;
