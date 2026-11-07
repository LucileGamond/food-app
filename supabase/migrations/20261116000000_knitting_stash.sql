-- Tricot : stock de laine, et besoins des patrons en attente (pour « Quel patron pour ma laine ? »).
--
--   knit_stash                 pelotes à la maison (même fiche que la laine d'un projet), chacun les siennes
--   knit_queue.meters_needed   métrage demandé par le patron (taille visée), s'il est connu
--   knit_queue.needle_mm       aiguilles du patron
--
-- La recherche d'un patron pour une laine compare d'abord ces besoins à la laine (dans l'application),
-- puis propose des idées avec le modèle si aucun patron en attente ne convient.

create table public.knit_stash (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  -- Une laine : { brand, name, color, dye_lot, composition, weight_g, length_m, skeins, needle_mm } (voir knit_yarns_are_valid).
  yarn jsonb not null check (yarn <> '{}'::jsonb and public.knit_yarns_are_valid(jsonb_build_array(yarn))),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knit_stash_profile_idx on public.knit_stash (profile_id, created_at);

alter table public.knit_stash enable row level security;
create policy "mon stock de laine" on public.knit_stash for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.knit_stash from anon, authenticated;
grant select, delete on public.knit_stash to authenticated;
grant insert (yarn, notes) on public.knit_stash to authenticated;
grant update (yarn, notes, updated_at) on public.knit_stash to authenticated;

alter table public.knit_queue
  add column meters_needed integer check (meters_needed between 1 and 20000),
  add column needle_mm numeric(4, 2) check (needle_mm between 1 and 30);
grant insert (meters_needed, needle_mm), update (meters_needed, needle_mm) on public.knit_queue to authenticated;
