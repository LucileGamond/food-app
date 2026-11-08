-- Tricot : « assez de laine pour finir ? » pour chaque laine du projet (les coloris sont des laines séparées).
--
--   knit_projects.yarn_checks   dernière pesée de chaque laine, repérée par sa place dans knit_projects.yarns :
--                               [{ "yarn": 0, "grams": 82, "rows_done": 140, "at": "…" }, …] (une par laine au plus)
--
-- Remplace yarn_check (une seule pesée, de la première laine) : une pesée déjà faite devient celle de la laine 0.

create function public.knit_yarn_checks_are_valid(p_checks jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_checks) = 'array'
    and jsonb_array_length(p_checks) <= 6
    and not exists (
      select 1
      from jsonb_array_elements(p_checks) c
      where jsonb_typeof(c) <> 'object'
        or jsonb_typeof(c -> 'yarn') <> 'number'
        or (c ->> 'yarn')::numeric not in (0, 1, 2, 3, 4, 5)
        or jsonb_typeof(c -> 'grams') <> 'number'
        or (c ->> 'grams')::numeric not between 0 and 100000
        or jsonb_typeof(c -> 'rows_done') <> 'number'
        or (c ->> 'rows_done')::numeric not between 0 and 1000000
    )
    and (select count(distinct c ->> 'yarn') from jsonb_array_elements(p_checks) c) = jsonb_array_length(p_checks)
$$;

alter table public.knit_projects rename column yarn_check to yarn_checks;
alter table public.knit_projects drop constraint knit_projects_yarn_check_check;

update public.knit_projects
set yarn_checks = case when yarn_checks is null then '[]'::jsonb else jsonb_build_array(yarn_checks || '{"yarn": 0}'::jsonb) end;

alter table public.knit_projects
  alter column yarn_checks set default '[]',
  alter column yarn_checks set not null,
  add constraint knit_projects_yarn_checks_check check (public.knit_yarn_checks_are_valid(yarn_checks));
