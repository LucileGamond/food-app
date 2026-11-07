-- Tricot : sens de lecture des diagrammes.
--
--   knit_charts.flat       à plat (allers-retours : rangs pairs sur l'envers, lus de gauche à droite) ou en rond
--   knit_charts.odd_only   à plat, seuls les rangs endroit sont dessinés : chaque ligne de la grille vaut deux rangs

alter table public.knit_charts
  add column flat boolean not null default true,
  add column odd_only boolean not null default false,
  add constraint knit_charts_odd_only_flat check (flat or not odd_only);

grant insert (flat, odd_only), update (flat, odd_only) on public.knit_charts to authenticated;
