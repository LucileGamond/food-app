-- Tricot : nombre de mailles au début d'une étape, saisi par la tricoteuse. Il fait foi : les mailles de chaque rang et
-- de la fin de l'étape s'en déduisent (augmentations et diminutions ajoutées). null : déduit des mailles de fin du patron.

alter table public.knit_steps
  add column start_stitches integer check (start_stitches between 1 and 5000);

grant update (start_stitches) on public.knit_steps to authenticated;
