-- Tricot : une seule liste d'échantillons par projet.
--
-- Avant, l'échantillon de la tricoteuse vivait à deux endroits : knit_projects.my_gauge_* (son échantillon général) et
-- knit_projects.needle_gauges (un échantillon par aiguille). Les calculs suivaient le second et l'écran montrait le
-- premier : on pouvait noter un échantillon sans jamais le revoir.
--
-- Désormais, needle_gauges est la seule source : autant d'échantillons que voulu, chacun avec son aiguille
-- (needle null : vaut pour toutes les aiguilles, l'échantillon par défaut). L'échantillon du patron reste à part,
-- dans pattern_gauge_*, parce que c'est une donnée du modèle et non de la tricoteuse.

-- L'échantillon général devient l'échantillon par défaut (sans aiguille), s'il n'y en a pas déjà un.
update public.knit_projects
set needle_gauges = needle_gauges || jsonb_build_array(
  jsonb_build_object('needle', null, 'stitches', my_gauge_stitches, 'rows', my_gauge_rows, 'checked', false)
)
where (my_gauge_stitches is not null or my_gauge_rows is not null)
  and not exists (
    select 1 from jsonb_array_elements(needle_gauges) as g where g->'needle' = 'null'::jsonb
  );

alter table public.knit_projects
  drop column my_gauge_stitches,
  drop column my_gauge_rows;
