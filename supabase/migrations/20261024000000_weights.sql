-- Suivi du poids : une mesure par personne et par jour.

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 1) not null check (weight_kg between 20 and 300),
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weight_entries_one_per_day unique (profile_id, measured_on)
);
create index weight_entries_date_idx on public.weight_entries (measured_on);

-- Pas de mesure dans le futur (1 jour de tolérance pour les fuseaux horaires).
create function public.check_weight_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.measured_on > current_date + 1 then
    raise exception 'La date de mesure ne peut pas être dans le futur' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger weight_entries_check_date
  before insert or update of measured_on on public.weight_entries
  for each row execute function public.check_weight_date();

create trigger weight_entries_updated_at before update on public.weight_entries
  for each row execute function public.set_updated_at();

alter table public.weight_entries enable row level security;

create policy "poids partagés" on public.weight_entries
  for all to authenticated using (true) with check (true);

revoke all on public.weight_entries from anon;
grant select, insert, update, delete on public.weight_entries to authenticated;

alter publication supabase_realtime add table public.weight_entries;

-- Enregistre un relevé (une date, un poids par personne) de façon atomique.
-- p_weights : [{ "profile_id": uuid, "weight_kg": number | null }, ...]
--   un poids null efface la mesure de cette personne à cette date.
-- p_previous_date : date d'origine en cas de modification (les mesures y sont déplacées).
create function public.save_weigh_in(
  p_measured_on date,
  p_weights jsonb,
  p_previous_date date default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_profile uuid;
  v_weight numeric;
begin
  if p_weights is null or jsonb_typeof(p_weights) <> 'array'
     or not exists (select 1 from jsonb_array_elements(p_weights) e where e ->> 'weight_kg' is not null) then
    raise exception 'Renseigne au moins un poids' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_weights) loop
    v_profile := (v_item ->> 'profile_id')::uuid;
    v_weight := (v_item ->> 'weight_kg')::numeric;

    if p_previous_date is not null and p_previous_date <> p_measured_on then
      delete from public.weight_entries where profile_id = v_profile and measured_on = p_previous_date;
    end if;

    if v_weight is null then
      delete from public.weight_entries where profile_id = v_profile and measured_on = p_measured_on;
    else
      insert into public.weight_entries (profile_id, measured_on, weight_kg)
      values (v_profile, p_measured_on, v_weight)
      on conflict (profile_id, measured_on) do update set weight_kg = excluded.weight_kg;
    end if;
  end loop;
end;
$$;

revoke execute on function public.save_weigh_in from public, anon;
grant execute on function public.save_weigh_in to authenticated;
