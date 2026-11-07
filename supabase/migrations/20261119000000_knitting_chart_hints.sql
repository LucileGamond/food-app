-- Tricot : diagrammes repérés à la lecture du patron.
--
--   knit_projects.chart_hints   [{ "page": 4, "title": "Torsade", "rows": 24, "step": 1, "flat": true, "oddOnly": false }]
--                               page du PDF et calage proposés quand la tricoteuse ajoute un diagramme depuis le PDF
--                               (« step » : position de l'étape, 0 = première). Elle recadre et ajuste elle-même.

alter table public.knit_projects
  add column chart_hints jsonb not null default '[]'
    check (jsonb_typeof(chart_hints) = 'array' and jsonb_array_length(chart_hints) <= 30);

grant update (chart_hints) on public.knit_projects to authenticated;
