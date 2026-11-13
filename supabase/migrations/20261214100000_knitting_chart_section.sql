-- Tricot : un diagramme rattaché à une sous-étape la suit.
--
--   knit_charts.section_id   identifiant de la sous-étape (sections[].id de son étape) ; ses rangs de début et de fin
--                            se recalculent d'après elle (start_row / end_row ne servent que s'il ne la retrouve plus).
--
-- Quand une sous-étape change d'étape (déplacée, séparée, regroupée), ses diagrammes changent d'étape avec elle : un
-- déclencheur sur les sous-étapes des étapes s'en charge, pour toutes les façons de les enregistrer.

alter table public.knit_charts
  add column section_id text check (char_length(section_id) between 1 and 40);

grant insert (section_id), update (section_id) on public.knit_charts to authenticated;

create function public.knit_charts_follow_sections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.knit_charts c
  set step_id = new.id
  where c.project_id = new.project_id
    and c.section_id is not null
    and c.step_id is distinct from new.id
    and c.section_id in (select x ->> 'id' from jsonb_array_elements(new.sections) x where jsonb_typeof(x -> 'id') = 'string');
  return null;
end;
$$;

create trigger knit_charts_follow_sections
  after insert or update of sections on public.knit_steps
  for each row execute function public.knit_charts_follow_sections();

revoke execute on function public.knit_charts_follow_sections from public, anon, authenticated;
