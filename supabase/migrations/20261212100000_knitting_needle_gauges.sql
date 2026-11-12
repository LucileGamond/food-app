-- Tricot : échantillon par aiguille, et conversions cm → rangs vérifiées une fois par aiguille.
--
--   knit_projects.needle_gauges   [{ "needle": 3.5 | null, "stitches": 22 | null, "rows": 30 | null, "checked": true }]
--                                 needle null : projet sans aiguille choisie. stitches/rows : l'échantillon de la
--                                 tricoteuse avec cette aiguille (sinon son échantillon général, sinon celui du patron).
--                                 checked : les conversions de cette aiguille ont été vérifiées, pour toutes ses
--                                 sous-étapes (plus besoin de valider chacune).

alter table public.knit_projects
  add column needle_gauges jsonb not null default '[]'
    check (jsonb_typeof(needle_gauges) = 'array' and jsonb_array_length(needle_gauges) <= 11);

grant update (needle_gauges) on public.knit_projects to authenticated;
