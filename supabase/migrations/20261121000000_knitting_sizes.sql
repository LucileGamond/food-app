-- Tricot : texte des étapes recopié tel quel, nombres de la taille choisie mis en valeur à l'écran.
--
--   knit_steps.instructions     texte du patron pour l'étape, avec les nombres de toutes les tailles (plus long)
--   knit_projects.sizes         tailles du patron, dans l'ordre (« 60 (64-68-72) » : une par nombre)
--   knit_projects.size_index    taille dont les nombres sont mis en valeur (0 = première), réglable dans le projet

alter table public.knit_steps drop constraint knit_steps_instructions_check;
alter table public.knit_steps add constraint knit_steps_instructions_check check (char_length(instructions) <= 20000);

alter table public.knit_projects
  add column sizes text[] not null default '{}' check (cardinality(sizes) <= 30),
  add column size_index smallint check (size_index >= 0 and size_index < cardinality(sizes));

grant update (sizes, size_index) on public.knit_projects to authenticated;
