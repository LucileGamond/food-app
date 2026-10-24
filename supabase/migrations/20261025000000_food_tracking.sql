-- Suivi alimentaire : un plan (quotas d'aliments par moment de la journée) par personne,
-- découpé en périodes. Chaque période fige une copie du plan, sur laquelle on note
-- les consommations ; au-delà du quota, une consommation est « hors plan ».

create extension if not exists btree_gist with schema extensions;

create type public.food_meal as enum ('BREAKFAST', 'LUNCH', 'SNACK', 'APERITIF', 'DINNER', 'POOL', 'SPORT');

-- Plan de référence (modifiable ; ne touche que les périodes créées ensuite)
create table public.food_plan_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  meal public.food_meal not null,
  category text not null check (btrim(category) <> '' and char_length(category) <= 60),
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  quantity numeric(7, 2) check (quantity > 0),
  unit text check (char_length(unit) <= 20),
  allowed_occurrences int not null check (allowed_occurrences between 1 and 99),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_plan_items_unique_name unique (profile_id, meal, name)
);
create index food_plan_items_profile_idx on public.food_plan_items (profile_id);

create trigger food_plan_items_updated_at before update on public.food_plan_items
  for each row execute function public.set_updated_at();

-- Périodes (dates incluses), sans chevauchement pour une même personne
create table public.food_periods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint food_periods_dates check (end_date >= start_date and end_date - start_date < 366),
  constraint food_periods_no_overlap exclude using gist (
    profile_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

-- Copie du plan figée pour une période
create table public.food_period_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.food_periods on delete cascade,
  meal public.food_meal not null,
  category text not null check (btrim(category) <> ''),
  name text not null check (btrim(name) <> ''),
  quantity numeric(7, 2),
  unit text,
  allowed_occurrences int not null check (allowed_occurrences between 1 and 99),
  position int not null default 0,
  constraint food_period_items_unique_name unique (period_id, meal, name)
);
create index food_period_items_period_idx on public.food_period_items (period_id);

-- Une ligne par consommation (plusieurs le même jour possibles)
create table public.food_consumptions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.food_period_items on delete cascade,
  consumed_on date not null,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index food_consumptions_item_idx on public.food_consumptions (item_id);

-- La date d'une consommation doit être dans sa période.
create function public.check_consumption_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.food_period_items i
    join public.food_periods p on p.id = i.period_id
    where i.id = new.item_id and new.consumed_on between p.start_date and p.end_date
  ) then
    raise exception 'La date doit être comprise dans la période' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger food_consumptions_check_date
  before insert or update of consumed_on, item_id on public.food_consumptions
  for each row execute function public.check_consumption_date();

-- Accès partagé entre les membres du foyer
alter table public.food_plan_items enable row level security;
alter table public.food_periods enable row level security;
alter table public.food_period_items enable row level security;
alter table public.food_consumptions enable row level security;

create policy "plan partagé" on public.food_plan_items for all to authenticated using (true) with check (true);
create policy "périodes partagées" on public.food_periods for all to authenticated using (true) with check (true);
create policy "éléments de période partagés" on public.food_period_items for all to authenticated using (true) with check (true);
create policy "consommations partagées" on public.food_consumptions for all to authenticated using (true) with check (true);

revoke all on public.food_plan_items, public.food_periods, public.food_period_items, public.food_consumptions from anon;
grant select, insert, update, delete
  on public.food_plan_items, public.food_periods, public.food_period_items, public.food_consumptions
  to authenticated;

alter publication supabase_realtime add table
  public.food_plan_items, public.food_periods, public.food_period_items, public.food_consumptions;

-- Crée une période en y copiant le plan courant de la personne.
create function public.create_food_period(p_profile_id uuid, p_start date, p_end date)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.food_plan_items where profile_id = p_profile_id) then
    raise exception 'Le plan est vide' using errcode = '22023';
  end if;

  insert into public.food_periods (profile_id, start_date, end_date)
  values (p_profile_id, p_start, p_end)
  returning id into v_id;

  insert into public.food_period_items (period_id, meal, category, name, quantity, unit, allowed_occurrences, position)
  select v_id, meal, category, name, quantity, unit, allowed_occurrences, position
  from public.food_plan_items
  where profile_id = p_profile_id;

  return v_id;
end;
$$;

revoke execute on function public.create_food_period from public, anon;
grant execute on function public.create_food_period to authenticated;
