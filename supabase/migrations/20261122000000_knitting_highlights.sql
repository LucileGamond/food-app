-- Tricot : surlignage des nombres d'une étape corrigé à la main.
--
--   knit_steps.highlights   { "<taille>": { "<position du nombre dans le texte>": true | false } }
--                           (« none » sans taille mise en valeur) : surligné ou non, à la place du calcul.

alter table public.knit_steps
  add column highlights jsonb not null default '{}'
    check (jsonb_typeof(highlights) = 'object' and octet_length(highlights::text) <= 20000);

grant update (highlights) on public.knit_steps to authenticated;
