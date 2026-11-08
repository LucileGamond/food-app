-- Planifier la semaine : qui mange à la maison (d'après l'agenda et des règles par personne), puis les repas
-- « À planifier » répartis sur les créneaux, avec qui cuisine.
--   meals.cook_id            qui cuisine le repas (facultatif)
--   meal_presence_rules      règles de chacun, lisibles par le foyer : midi en semaine au travail, rendez-vous
--                            qui n'empêchent pas de manger à la maison (« escalade »)
--   plan_week(p_meals)       crée les repas d'un coup et retire les éléments planifiés de la liste

alter table public.meals add column cook_id uuid references public.profiles on delete set null;

create table public.meal_presence_rules (
  profile_id uuid primary key references public.profiles on delete cascade default auth.uid(),
  weekday_lunch_at_work boolean not null default false,
  ignored_keywords text[] not null default '{}'
    check (cardinality(ignored_keywords) <= 20 and char_length(array_to_string(ignored_keywords, '')) <= 400),
  updated_at timestamptz not null default now()
);

alter table public.meal_presence_rules enable row level security;
create policy "règles lisibles par le foyer" on public.meal_presence_rules for select to authenticated using (true);
create policy "ma règle : ajout" on public.meal_presence_rules for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "ma règle : modification" on public.meal_presence_rules for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
revoke all on public.meal_presence_rules from anon, authenticated;
grant select, insert, update on public.meal_presence_rules to authenticated;

-- p_meals : [{ item_id, meal_date, slot, people, cook_id }]. Un élément placé plusieurs fois (restes) : le premier
-- repas le planifie (plan_inbox_item), les suivants en sont des copies. Tout ou rien.
create function public.plan_week(p_meals jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_entry record;
  v_first jsonb := '{}';
  v_meal uuid;
  v_count integer := 0;
begin
  for v_entry in
    select * from jsonb_to_recordset(p_meals) as x(item_id uuid, meal_date date, slot public.meal_slot, people uuid[], cook_id uuid)
    order by meal_date, slot
  loop
    if v_first ? v_entry.item_id::text then
      v_meal := public.duplicate_meal((v_first ->> v_entry.item_id::text)::uuid, v_entry.meal_date, v_entry.slot);
      update public.meals set people = v_entry.people where id = v_meal;
    else
      v_meal := public.plan_inbox_item(v_entry.item_id, v_entry.meal_date, v_entry.slot, v_entry.people);
      v_first := v_first || jsonb_build_object(v_entry.item_id::text, v_meal);
    end if;
    update public.meals set cook_id = v_entry.cook_id where id = v_meal;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.plan_week from public, anon;
grant execute on function public.plan_week to authenticated;
