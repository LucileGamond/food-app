-- Tricot : lectures d'un patron gardées dans la bibliothèque, une par taille.
--
--   knit_pattern_readings   ce que le modèle a lu dans le PDF d'un patron (étapes, tailles, échantillon, diagrammes…),
--                           pour la taille lue. Un nouveau projet du même patron, dans une taille déjà lue, reprend
--                           cette lecture sans rappeler le modèle (gratuit et immédiat).
--
-- La lecture est propre à une taille : le texte des étapes est gardé pour toutes les tailles, mais les rangs, mailles
-- et répétitions comptés sont ceux de la taille lue. size_index : position de cette taille parmi celles du patron
-- (null pour un patron en taille unique).

create table public.knit_pattern_readings (
  pattern_id uuid not null references public.knit_patterns on delete cascade,
  size_index smallint check (size_index between 0 and 29),
  -- Nom de la taille lue (« M », « Unique »), pour l'affichage sans charger la lecture.
  size_label text not null check (btrim(size_label) <> '' and char_length(size_label) <= 40),
  -- coalesce : une clé absente donne null, qu'un check laisserait passer.
  reading jsonb not null constraint knit_pattern_readings_reading_valid check (
    coalesce(jsonb_typeof(reading -> 'steps') = 'array' and jsonb_typeof(reading -> 'sizes') = 'array', false)
    and pg_column_size(reading) <= 4000000
  ),
  read_at timestamptz not null default now(),
  constraint knit_pattern_readings_one_per_size unique nulls not distinct (pattern_id, size_index)
);

alter table public.knit_pattern_readings enable row level security;
create policy "lectures de mes patrons" on public.knit_pattern_readings for all to authenticated
  using (exists (select 1 from public.knit_patterns p where p.id = pattern_id and p.profile_id = auth.uid()))
  with check (exists (select 1 from public.knit_patterns p where p.id = pattern_id and p.profile_id = auth.uid()));
revoke all on public.knit_pattern_readings from anon, authenticated;
grant select, delete on public.knit_pattern_readings to authenticated;
grant insert (pattern_id, size_index, size_label, reading, read_at) on public.knit_pattern_readings to authenticated;
-- Toutes les colonnes : relire une taille déjà lue remplace sa lecture (upsert). La règle d'accès garde le patron à soi.
grant update (pattern_id, size_index, size_label, reading, read_at) on public.knit_pattern_readings to authenticated;
