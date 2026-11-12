-- Tricot : une étape à tricoter plusieurs fois (les deux manches, les deux devants…).
--
--   knit_steps.times   nombre de fois où l'étape se tricote (1 à 10)
--   knit_steps.pass    fois en cours (1 = la première) ; le compteur de rangs (row_count) est celui de cette fois-ci.
--                      L'étape est terminée (done) quand la dernière fois est finie.

alter table public.knit_steps
  add column times smallint not null default 1 constraint knit_steps_times_check check (times between 1 and 10),
  add column pass smallint not null default 1;
alter table public.knit_steps add constraint knit_steps_pass_check check (pass between 1 and times);

grant update (times, pass) on public.knit_steps to authenticated;
