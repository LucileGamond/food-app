-- Tricot : « patron adapté à moi » (facultatif).
--
--   knit_projects.adaptation   étapes recalculées pour l'échantillon de la tricoteuse et ses retouches ; le patron
--                              d'origine (knit_steps) n'est pas touché :
--                              { "request": "5 cm de plus aux manches", "active": true, "at": "…",
--                                "steps": [{ "step_id": "…", "total_rows": 136, "stitches": 66, "sections": [...], "note": "…" }] }
--                              null : pas d'adaptation. « active » : l'écran suit le patron adapté (sinon celui d'origine).

alter table public.knit_projects
  add column adaptation jsonb
    check (
      adaptation is null
      or (
        jsonb_typeof(adaptation) = 'object'
        and jsonb_typeof(adaptation -> 'active') = 'boolean'
        and jsonb_typeof(adaptation -> 'request') = 'string'
        and char_length(adaptation ->> 'request') <= 1000
        and jsonb_typeof(adaptation -> 'steps') = 'array'
        and jsonb_array_length(adaptation -> 'steps') between 1 and 200
        and pg_column_size(adaptation) <= 500000
      )
    );

grant update (adaptation) on public.knit_projects to authenticated;
