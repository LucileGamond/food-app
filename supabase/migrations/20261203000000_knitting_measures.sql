-- Tricot : fiches de mesures, pour choisir la taille d'un patron (la sienne, ou celle d'un proche pour un cadeau).
--
--   knit_measures   nom de la personne et ses mesures en cm (poitrine, taille, hanches, longueur de bras, tête),
--                   chacun les siennes. Comparées au tableau des mesures du patron, relevé à la lecture.

create table public.knit_measures (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  chest numeric(4, 1) check (chest between 10 and 300),
  waist numeric(4, 1) check (waist between 10 and 300),
  hip numeric(4, 1) check (hip between 10 and 300),
  arm numeric(4, 1) check (arm between 10 and 300),
  head numeric(4, 1) check (head between 10 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knit_measures_profile_idx on public.knit_measures (profile_id, created_at);

alter table public.knit_measures enable row level security;
create policy "mes fiches de mesures" on public.knit_measures for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.knit_measures from anon, authenticated;
grant select, delete on public.knit_measures to authenticated;
grant insert (name, chest, waist, hip, arm, head) on public.knit_measures to authenticated;
grant update (name, chest, waist, hip, arm, head, updated_at) on public.knit_measures to authenticated;
