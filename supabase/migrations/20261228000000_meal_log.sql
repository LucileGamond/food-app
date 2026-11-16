-- Journal des repas réellement mangés (planifiés ou non) : végé, non végé ou pas de repas, par personne et par
-- moment (petit-déjeuner, midi, soir). Rappel du soir si la journée n'est pas remplie ou si rien n'est noté
-- dans la période du plan alimentaire en cours.

create table public.meal_log (
  profile_id uuid not null references public.profiles on delete cascade,
  eaten_on date not null,
  slot text not null check (slot in ('BREAKFAST', 'LUNCH', 'DINNER')),
  kind text not null check (kind in ('vegetarian', 'meat', 'skipped')),
  updated_at timestamptz not null default now(),
  primary key (profile_id, eaten_on, slot)
);

alter table public.meal_log enable row level security;
create policy "journal des repas partagé" on public.meal_log for all to authenticated using (true) with check (true);
revoke all on public.meal_log from anon;
grant select, insert, update, delete on public.meal_log to authenticated;
alter publication supabase_realtime add table public.meal_log;

-- Sujet de notification « repas » (rappel du soir).
alter table public.user_settings drop constraint user_settings_muted_notifications_check;
alter table public.user_settings add constraint user_settings_muted_notifications_check
  check (muted_notifications <@ array['courses', 'hydratation', 'plantes', 'agenda', 'repas']);

-- Jour (heure de Paris) du dernier rappel des repas : un seul par jour, écrit par le serveur seulement.
alter table public.user_settings add column meals_reminded_on date;

-- Personnes à rappeler ce soir : page Plan affichée, rappel non coupé, un appareil abonné, pas encore rappelées
-- aujourd'hui, à partir de 21 h (heure de Paris), et quelque chose à remplir : un moment du journal sans réponse
-- (`missing`) ou une période en cours sans rien de noté aujourd'hui (`plan_empty`).
create function public.meal_reminders_due(p_now timestamptz default now())
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
      exists (
        select 1 from public.food_periods p, today
        where p.profile_id = s.profile_id and today.d between p.start_date and p.end_date
          and not exists (
            select 1 from public.food_period_items i join public.food_consumptions c on c.item_id = i.id
            where i.period_id = p.id and c.consumed_on = today.d
          )
      ) as plan_empty
    from public.user_settings s, today
    where not ('plan' = any (s.disabled_pages))
      and not ('repas' = any (s.muted_notifications))
      and (p_now at time zone 'Europe/Paris')::time >= time '21:00'
      and (s.meals_reminded_on is null or s.meals_reminded_on < today.d)
      and exists (select 1 from public.push_subscriptions ps where ps.profile_id = s.profile_id)
  )
  select profile_id, missing, plan_empty from candidates where missing > 0 or plan_empty;
$$;

-- Réserve les rappels du soir (date notée) : deux exécutions simultanées n'envoient pas le même.
create function public.claim_meal_reminders(p_now timestamptz default now())
returns table (profile_id uuid, missing int, plan_empty boolean)
language sql
security definer
set search_path = ''
as $$
  update public.user_settings s
  set meals_reminded_on = (p_now at time zone 'Europe/Paris')::date
  from public.meal_reminders_due(p_now) due
  where s.profile_id = due.profile_id
    and (s.meals_reminded_on is null or s.meals_reminded_on < (p_now at time zone 'Europe/Paris')::date)
  returning s.profile_id, due.missing, due.plan_empty;
$$;

revoke execute on function public.meal_reminders_due, public.claim_meal_reminders from public, anon, authenticated;
grant execute on function public.meal_reminders_due, public.claim_meal_reminders to service_role;

-- Toutes les heures : le premier passage après 21 h rappelle ceux qui n'ont pas tout rempli.
select cron.schedule(
  'notify-meals',
  '15 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_url'),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_secret')
      ),
      body := '{"job": "meals"}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_secret')
      and exists (select 1 from public.meal_reminders_due())
  $cron$
);
