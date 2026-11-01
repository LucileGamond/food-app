-- Réglages de chacun (pages affichées, notifications reçues) et suivi d'hydratation.
--
--   user_settings   une ligne par personne, créée au premier enregistrement (sinon : valeurs par défaut)
--   water_intakes   verres bus (chacun ne voit que les siens)
--   pg_cron (toutes les 10 minutes, s'il y a des rappels à envoyer) ──pg_net──▶ notify-shopping {"job": "hydration"}
--
-- Rappel : entre 9 h et 23 h (heure de Paris), après 4 h sans boire (ni rappel), tant que l'objectif du jour
-- n'est pas atteint, si le suivi est activé et ses notifications non coupées.
-- La tâche réutilise l'adresse et le secret de notify-shopping (Vault) : rien de plus à configurer.

create table public.user_settings (
  profile_id uuid primary key references public.profiles on delete cascade default auth.uid(),
  -- Le suivi d'hydratation est désactivé tant que la personne ne l'a pas activé.
  disabled_pages text[] not null default '{hydratation}'
    check (disabled_pages <@ array['planning', 'recettes', 'plan', 'courses', 'poids', 'hydratation']),
  muted_notifications text[] not null default '{}'
    check (muted_notifications <@ array['courses', 'hydratation']),
  hydration_goal_ml integer not null default 1500 check (hydration_goal_ml between 500 and 5000),
  hydration_reminded_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
create policy "mes réglages" on public.user_settings for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.user_settings from anon, authenticated;
grant select, insert, delete on public.user_settings to authenticated;
-- La date du dernier rappel est réservée au serveur.
grant update (disabled_pages, muted_notifications, hydration_goal_ml, updated_at) on public.user_settings to authenticated;

create table public.water_intakes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  volume_ml integer not null check (volume_ml between 50 and 2000),
  drunk_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index water_intakes_profile_idx on public.water_intakes (profile_id, drunk_at);

alter table public.water_intakes enable row level security;
create policy "mes verres" on public.water_intakes for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.water_intakes from anon, authenticated;
grant select, insert, delete on public.water_intakes to authenticated;

alter publication supabase_realtime add table public.water_intakes;

-- Personnes à qui rappeler de boire à l'instant p_now (avec ce qu'elles ont bu aujourd'hui et leur objectif).
create function public.hydration_reminders_due(p_now timestamptz default now())
returns table (profile_id uuid, drunk_ml integer, goal_ml integer)
language sql
stable
security definer
set search_path = ''
as $$
  with day as (
    select
      ((p_now at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris' as midnight,
      ((p_now at time zone 'Europe/Paris')::date + time '09:00') at time zone 'Europe/Paris' as day_start,
      ((p_now at time zone 'Europe/Paris')::date + time '23:00') at time zone 'Europe/Paris' as day_end
  ),
  today as (
    select s.profile_id, s.hydration_goal_ml, s.hydration_reminded_at,
      coalesce(sum(w.volume_ml), 0)::integer as drunk_ml,
      max(w.drunk_at) as last_drink
    from public.user_settings s
    cross join day d
    left join public.water_intakes w on w.profile_id = s.profile_id and w.drunk_at >= d.midnight and w.drunk_at <= p_now
    where not ('hydratation' = any (s.disabled_pages))
      and not ('hydratation' = any (s.muted_notifications))
    group by s.profile_id
  )
  select t.profile_id, t.drunk_ml, t.hydration_goal_ml
  from today t
  cross join day d
  where p_now >= d.day_start
    and p_now < d.day_end
    and t.drunk_ml < t.hydration_goal_ml
    and p_now - greatest(d.day_start, t.last_drink, t.hydration_reminded_at) >= interval '4 hours'
    and exists (select 1 from public.push_subscriptions p where p.profile_id = t.profile_id);
$$;

-- Réserve les rappels à envoyer (date du rappel notée) : deux exécutions simultanées n'envoient pas le même.
create function public.claim_hydration_reminders(p_now timestamptz default now())
returns table (profile_id uuid, drunk_ml integer, goal_ml integer)
language sql
security definer
set search_path = ''
as $$
  with due as (select * from public.hydration_reminders_due(p_now)),
  claimed as (
    update public.user_settings s
    set hydration_reminded_at = p_now
    from due
    where s.profile_id = due.profile_id
      and (s.hydration_reminded_at is null or s.hydration_reminded_at <= p_now - interval '4 hours')
    returning s.profile_id
  )
  select due.profile_id, due.drunk_ml, due.goal_ml from due join claimed using (profile_id);
$$;

revoke execute on function public.hydration_reminders_due, public.claim_hydration_reminders from public, anon, authenticated;
grant execute on function public.hydration_reminders_due, public.claim_hydration_reminders to service_role;

select cron.schedule(
  'notify-hydration',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_url'),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_secret')
      ),
      body := '{"job": "hydration"}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_secret')
      and exists (select 1 from public.hydration_reminders_due())
  $cron$
);
