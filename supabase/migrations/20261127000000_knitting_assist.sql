-- Tricot : aides pendant le tricot.
--
--   knit_projects.abbreviations   abréviations du patron, lues avec lui : [{ "abbr": "ssk", "meaning": "glisser 2 m. …" }]
--   knit_projects.yarn_check      dernière pesée de la laine principale : { "grams": 82, "rows_done": 140, "at": "…" }
--                                 (« assez de laine pour finir ? » se calcule à l'écran)
--   knit_steps.translation        traduction en français du texte de l'étape (patron en anglais), nombres inchangés

alter table public.knit_projects
  add column abbreviations jsonb not null default '[]'
    check (jsonb_typeof(abbreviations) = 'array' and jsonb_array_length(abbreviations) <= 200),
  add column yarn_check jsonb
    check (
      yarn_check is null
      or (
        jsonb_typeof(yarn_check) = 'object'
        and jsonb_typeof(yarn_check -> 'grams') = 'number'
        and (yarn_check ->> 'grams')::numeric between 0 and 100000
        and jsonb_typeof(yarn_check -> 'rows_done') = 'number'
        and (yarn_check ->> 'rows_done')::numeric between 0 and 1000000
      )
    );

alter table public.knit_steps
  add column translation text check (char_length(translation) <= 30000);

grant update (abbreviations, yarn_check) on public.knit_projects to authenticated;
grant update (translation) on public.knit_steps to authenticated;
