-- Page « Végé » (section Repas) : le journal des repas végés sort de la page Plan. Affichée par défaut, sauf pour
-- qui avait masqué la page Plan. Le rappel du soir suit la page Végé ; il ne parle du plan du jour que si la page
-- Plan est affichée.

alter table public.user_settings drop constraint user_settings_disabled_pages_check;
alter table public.user_settings add constraint user_settings_disabled_pages_check
  check (disabled_pages <@ array['planning', 'recettes', 'vege', 'plan', 'courses', 'poids', 'hydratation', 'tricot', 'plantes', 'agenda']);
update public.user_settings set disabled_pages = array_append(disabled_pages, 'vege')
where 'plan' = any (disabled_pages) and not ('vege' = any (disabled_pages));

create or replace function public.meal_reminders_due(p_now timestamptz default now())
returns table (profile_id uuid, missing int, plan_empty boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (select (p_now at time zone 'Europe/Paris')::date as d),
  candidates as (
    select s.profile_id,
      3 - (select count(*)::int from public.meal_log l, today where l.profile_id = s.profile_id and l.eaten_on = today.d) as missing,
      not ('plan' = any (s.disabled_pages)) and exists (
        select 1 from public.food_periods p, today
        where p.profile_id = s.profile_id and today.d between p.start_date and p.end_date
          and not exists (
            select 1 from public.food_period_items i join public.food_consumptions c on c.item_id = i.id
            where i.period_id = p.id and c.consumed_on = today.d
          )
      ) as plan_empty
    from public.user_settings s, today
    where not ('vege' = any (s.disabled_pages))
      and not ('repas' = any (s.muted_notifications))
      and (p_now at time zone 'Europe/Paris')::time >= time '21:00'
      and (s.meals_reminded_on is null or s.meals_reminded_on < today.d)
      and exists (select 1 from public.push_subscriptions ps where ps.profile_id = s.profile_id)
  )
  select profile_id, missing, plan_empty from candidates where missing > 0 or plan_empty;
$$;

revoke execute on function public.meal_reminders_due from public, anon, authenticated;
grant execute on function public.meal_reminders_due to service_role;
