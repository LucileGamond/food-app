-- Module Plantes (repris de life-app) : fiches, photos, règles d'arrosage par période de l'année et historique
-- (qui a arrosé, quand, combien). Données partagées par le foyer, comme les listes de courses.
-- Le calcul des échéances est fait par le moteur TS partagé (supabase/functions/_shared/watering), dans
-- l'application et pour les rappels du matin.

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  species text check (species is null or char_length(species) <= 120),
  location text check (location is null or char_length(location) <= 80),
  planted_on date,
  planted_height_cm numeric(6, 1) check (planted_height_cm is null or planted_height_cm > 0),
  pot_diameter_cm numeric(6, 1) check (pot_diameter_cm is null or pot_diameter_cm > 0),
  notes text check (notes is null or char_length(notes) <= 4000),
  archived_at timestamptz,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plants_active_idx on public.plants (name) where archived_at is null;

create trigger plants_updated_at before update on public.plants
  for each row execute function public.set_updated_at();

-- Photos : chemins « <plant_id>/<uuid>.<ext> » du bucket privé plant-photos.
create table public.plant_photos (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants on delete cascade,
  storage_path text not null unique check (storage_path like plant_id::text || '/%'),
  position int not null check (position >= 0),
  created_at timestamptz not null default now()
);
create index plant_photos_plant_idx on public.plant_photos (plant_id, position);

alter table public.plants enable row level security;
alter table public.plant_photos enable row level security;

create policy "plantes partagées" on public.plants
  for all to authenticated using (true) with check (true);
create policy "photos de plantes partagées" on public.plant_photos
  for all to authenticated using (true) with check (true);

revoke all on public.plants, public.plant_photos from anon;
grant select, insert, update, delete on public.plants, public.plant_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plant-photos', 'plant-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "photos de plantes lisibles" on storage.objects
  for select to authenticated using (bucket_id = 'plant-photos');
create policy "photos de plantes ajoutées" on storage.objects
  for insert to authenticated with check (bucket_id = 'plant-photos');
create policy "photos de plantes supprimées" on storage.objects
  for delete to authenticated using (bucket_id = 'plant-photos');

-- ---------------------------------------------------------------------------
-- Règles d'arrosage : période de l'année, 1er arrosage, fréquence, quantité
-- ---------------------------------------------------------------------------

create type public.watering_interval as enum ('day', 'week', 'month');

-- Les mois forment un seul bloc consécutif (décembre → janvier autorisé), sans doublon.
create function public.months_are_valid(p_months smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_months is not null
    and cardinality(p_months) between 1 and 12
    and (select count(distinct m) from unnest(p_months) m) = cardinality(p_months)
    and (select bool_and(m between 1 and 12) from unnest(p_months) m)
    -- nombre de « fins de bloc » : un mois dont le suivant n'est pas sélectionné (0 si toute l'année)
    and (select count(*) from unnest(p_months) m where not ((m % 12) + 1)::smallint = any (p_months)) <= 1
$$;

create table public.watering_rules (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants on delete cascade,
  months smallint[] not null check (public.months_are_valid(months)),
  first_watering_on date not null,
  interval_count int not null check (interval_count between 1 and 365),
  interval_unit public.watering_interval not null,
  amount_ml int not null check (amount_ml between 1 and 100000),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint first_watering_in_months check (extract(month from first_watering_on)::smallint = any (months))
);
create index watering_rules_plant_idx on public.watering_rules (plant_id);

create trigger watering_rules_updated_at before update on public.watering_rules
  for each row execute function public.set_updated_at();

-- Deux règles d'une même plante ne peuvent pas couvrir le même mois.
create function public.check_watering_rule_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.plant_id::text));
  if exists (
    select 1 from public.watering_rules r
    where r.plant_id = new.plant_id and r.id <> new.id and r.months && new.months
  ) then
    raise exception 'Deux règles de la même plante couvrent le même mois' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger watering_rules_no_overlap
  before insert or update of months, plant_id on public.watering_rules
  for each row execute function public.check_watering_rule_overlap();

-- Remplace toutes les règles d'une plante en une transaction (formulaire).
create function public.replace_watering_rules(p_plant_id uuid, p_rules jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Règles invalides' using errcode = '22023';
  end if;
  if not exists (select 1 from public.plants where id = p_plant_id) then
    raise exception 'Plante introuvable' using errcode = 'P0002';
  end if;

  delete from public.watering_rules where plant_id = p_plant_id;

  insert into public.watering_rules (plant_id, months, first_watering_on, interval_count, interval_unit, amount_ml, note)
  select p_plant_id,
         array(select m::smallint from jsonb_array_elements_text(r -> 'months') as m order by 1),
         (r ->> 'first_watering_on')::date,
         (r ->> 'interval_count')::int,
         (r ->> 'interval_unit')::public.watering_interval,
         (r ->> 'amount_ml')::int,
         nullif(btrim(r ->> 'note'), '')
  from jsonb_array_elements(p_rules) as r;
end;
$$;

-- Crée ou met à jour une plante et ses règles en une seule transaction (formulaire).
create function public.save_plant(p_plant jsonb, p_rules jsonb, p_plant_id uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_plant_id;
begin
  if v_id is null then
    insert into public.plants (name, species, location, planted_on, planted_height_cm, pot_diameter_cm, notes)
    values (
      btrim(p_plant ->> 'name'),
      nullif(btrim(p_plant ->> 'species'), ''),
      nullif(btrim(p_plant ->> 'location'), ''),
      (p_plant ->> 'planted_on')::date,
      (p_plant ->> 'planted_height_cm')::numeric,
      (p_plant ->> 'pot_diameter_cm')::numeric,
      nullif(btrim(p_plant ->> 'notes'), '')
    )
    returning id into v_id;
  else
    update public.plants
    set name = btrim(p_plant ->> 'name'),
        species = nullif(btrim(p_plant ->> 'species'), ''),
        location = nullif(btrim(p_plant ->> 'location'), ''),
        planted_on = (p_plant ->> 'planted_on')::date,
        planted_height_cm = (p_plant ->> 'planted_height_cm')::numeric,
        pot_diameter_cm = (p_plant ->> 'pot_diameter_cm')::numeric,
        notes = nullif(btrim(p_plant ->> 'notes'), '')
    where id = v_id;
    if not found then
      raise exception 'Plante introuvable' using errcode = 'P0002';
    end if;
  end if;

  perform public.replace_watering_rules(v_id, p_rules);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Historique : qui a arrosé, quand, combien
-- ---------------------------------------------------------------------------

create table public.watering_events (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants on delete cascade,
  rule_id uuid references public.watering_rules on delete set null,
  -- échéance couverte par cet arrosage ; null = arrosage hors planning
  scheduled_on date,
  watered_at timestamptz not null default now(),
  amount_ml int check (amount_ml is null or amount_ml between 1 and 100000),
  done_by uuid references public.profiles on delete set null default auth.uid(),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (plant_id, scheduled_on)
);
create index watering_events_plant_idx on public.watering_events (plant_id, watered_at desc);

-- L'auteur est toujours la personne connectée (impossible d'arroser « au nom » de quelqu'un).
create function public.set_watering_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.done_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger watering_events_author before insert on public.watering_events
  for each row execute function public.set_watering_author();

alter table public.watering_rules enable row level security;
alter table public.watering_events enable row level security;

create policy "règles partagées" on public.watering_rules
  for all to authenticated using (true) with check (true);
create policy "arrosages lisibles" on public.watering_events
  for select to authenticated using (true);
create policy "arrosages ajoutés" on public.watering_events
  for insert to authenticated with check (true);
create policy "arrosages annulés" on public.watering_events
  for delete to authenticated using (true);

revoke all on public.watering_rules, public.watering_events from anon;
grant select, insert, update, delete on public.watering_rules to authenticated;
revoke update, truncate on public.watering_events from authenticated;
grant select, insert, delete on public.watering_events to authenticated;

revoke execute on function public.replace_watering_rules, public.save_plant from public, anon;
grant execute on function public.replace_watering_rules, public.save_plant to authenticated;

alter publication supabase_realtime add table public.plants, public.watering_rules, public.watering_events;

-- ---------------------------------------------------------------------------
-- Réglages : page « Plantes » (masquée par défaut) et rappels d'arrosage du matin
-- ---------------------------------------------------------------------------

alter table public.user_settings drop constraint user_settings_disabled_pages_check;
alter table public.user_settings add constraint user_settings_disabled_pages_check
  check (disabled_pages <@ array['planning', 'recettes', 'plan', 'courses', 'poids', 'hydratation', 'tricot', 'plantes']);
alter table public.user_settings alter column disabled_pages set default '{hydratation,tricot,plantes}';
update public.user_settings set disabled_pages = array_append(disabled_pages, 'plantes') where not ('plantes' = any (disabled_pages));

alter table public.user_settings drop constraint user_settings_muted_notifications_check;
alter table public.user_settings add constraint user_settings_muted_notifications_check
  check (muted_notifications <@ array['courses', 'hydratation', 'plantes']);

-- Jour (heure de Paris) du dernier rappel d'arrosage : un seul par jour. Écrit par le serveur seulement
-- (pas de droit d'écriture sur cette colonne pour les connectés).
alter table public.user_settings add column plants_reminded_on date;

-- Personnes à qui envoyer le rappel d'arrosage du jour : page affichée, rappels non coupés, un appareil abonné,
-- pas encore rappelées aujourd'hui, et pas avant 8 h (heure de Paris). Les plantes à arroser sont calculées
-- par la fonction (moteur TS).
create function public.plant_reminders_due(p_now timestamptz default now())
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.profile_id
  from public.user_settings s
  where not ('plantes' = any (s.disabled_pages))
    and not ('plantes' = any (s.muted_notifications))
    and (p_now at time zone 'Europe/Paris')::time >= time '08:00'
    and (s.plants_reminded_on is null or s.plants_reminded_on < (p_now at time zone 'Europe/Paris')::date)
    and exists (select 1 from public.push_subscriptions p where p.profile_id = s.profile_id);
$$;

-- Réserve les rappels du jour (date notée) : deux exécutions simultanées n'envoient pas le même.
create function public.claim_plant_reminders(p_now timestamptz default now())
returns table (profile_id uuid)
language sql
security definer
set search_path = ''
as $$
  update public.user_settings s
  set plants_reminded_on = (p_now at time zone 'Europe/Paris')::date
  from public.plant_reminders_due(p_now) due
  where s.profile_id = due.profile_id
    and (s.plants_reminded_on is null or s.plants_reminded_on < (p_now at time zone 'Europe/Paris')::date)
  returning s.profile_id;
$$;

revoke execute on function public.plant_reminders_due, public.claim_plant_reminders from public, anon, authenticated;
grant execute on function public.plant_reminders_due, public.claim_plant_reminders to service_role;

-- Toutes les heures : le premier passage après 8 h envoie le rappel du jour à ceux qui ne l'ont pas encore eu.
select cron.schedule(
  'notify-plants',
  '5 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_url'),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_secret')
      ),
      body := '{"job": "plants"}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_secret')
      and exists (select 1 from public.plant_reminders_due())
  $cron$
);

-- Ménage de nuit : les photos de plantes encore utilisées.
create or replace function public.referenced_files(p_bucket text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select storage_path from public.recipe_photos where p_bucket = 'recipe-photos'
  union
  select unnest(photos) from public.planning_inbox where p_bucket = 'recipe-photos'
  union
  select pdf_path from public.knit_projects where p_bucket = 'knit-patterns' and pdf_path is not null
  union
  select storage_path from public.plant_photos where p_bucket = 'plant-photos'
$$;
