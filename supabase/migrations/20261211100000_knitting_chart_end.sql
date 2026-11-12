-- Tricot : un diagramme rattaché à une sous-étape s'arrête à sa fin (end_row, rang de l'étape) ; null : jusqu'à la fin
-- de l'étape, comme avant.

alter table public.knit_charts
  add column end_row integer check (end_row between 1 and 5000 and end_row >= start_row);

grant insert (end_row), update (end_row) on public.knit_charts to authenticated;
