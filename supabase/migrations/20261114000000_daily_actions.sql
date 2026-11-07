-- Gestes du quotidien :
--   1. contenants d'eau réglables par personne (verre, gourde, mug…), proposés sur la page Eau et dans le rappel ;
--   2. boutons dans les notifications (« +20 cl », « C’est arrosé ») qui agissent sans ouvrir l'application ;
--   3. « Ce que l'autre a fait » : fil des derniers gestes de l'autre (arrosages, repas planifiés, courses…).
--
-- Boutons des notifications : notify-shopping crée un jeton par personne et par notification
-- (create_notification_action, clé de service), envoyé avec la notification. Le service worker l'échange contre
-- le geste avec la clé publique de l'application (run_notification_action, rôle anon) : le jeton, aléatoire,
-- à usage unique et valable 12 h, est la seule preuve demandée.

-- ---------------------------------------------------------------------------
-- 1. Contenants d'eau
-- ---------------------------------------------------------------------------

-- 1 à 4 contenants : { "name": "Gourde", "ml": 750 } (nom de 1 à 20 caractères, 50 ml à 2 L).
create function public.hydration_containers_are_valid(p_containers jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_containers) = 'array'
    and jsonb_array_length(p_containers) between 1 and 4
    and not exists (
      select 1
      from jsonb_array_elements(p_containers) c
      where jsonb_typeof(c) <> 'object'
        or jsonb_typeof(c -> 'name') is distinct from 'string'
        or char_length(btrim(c ->> 'name')) not between 1 and 20
        or jsonb_typeof(c -> 'ml') is distinct from 'number'
        or (c ->> 'ml') !~ '^[0-9]+$'
        or (c ->> 'ml')::integer not between 50 and 2000
    );
$$;

alter table public.user_settings
  add column hydration_containers jsonb not null
    default '[{"name": "Petit verre", "ml": 200}, {"name": "Grand verre", "ml": 330}]'::jsonb
    check (public.hydration_containers_are_valid(hydration_containers));
-- Droits colonne par colonne (security_hardening) : la nouvelle colonne s'ajoute à la liste.
grant insert (hydration_containers), update (hydration_containers) on public.user_settings to authenticated;

-- Les rappels d'hydratation renvoient aussi les contenants (boutons de la notification).
drop function public.claim_hydration_reminders(timestamptz);
drop function public.hydration_reminders_due(timestamptz);

create function public.hydration_reminders_due(p_now timestamptz default now())
returns table (profile_id uuid, drunk_ml integer, goal_ml integer, containers jsonb)
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
    select s.profile_id, s.hydration_goal_ml, s.hydration_reminded_at, s.hydration_containers,
      coalesce(sum(w.volume_ml), 0)::integer as drunk_ml,
      max(w.drunk_at) as last_drink
    from public.user_settings s
    cross join day d
    left join public.water_intakes w on w.profile_id = s.profile_id and w.drunk_at >= d.midnight and w.drunk_at <= p_now
    where not ('hydratation' = any (s.disabled_pages))
      and not ('hydratation' = any (s.muted_notifications))
    group by s.profile_id
  )
  select t.profile_id, t.drunk_ml, t.hydration_goal_ml, t.hydration_containers
  from today t
  cross join day d
  where p_now >= d.day_start
    and p_now < d.day_end
    and t.drunk_ml < t.hydration_goal_ml
    and p_now - greatest(d.day_start, t.last_drink, t.hydration_reminded_at) >= interval '4 hours'
    and exists (select 1 from public.push_subscriptions p where p.profile_id = t.profile_id);
$$;

create function public.claim_hydration_reminders(p_now timestamptz default now())
returns table (profile_id uuid, drunk_ml integer, goal_ml integer, containers jsonb)
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
  select due.profile_id, due.drunk_ml, due.goal_ml, due.containers from due join claimed using (profile_id);
$$;

revoke execute on function public.hydration_reminders_due, public.claim_hydration_reminders from public, anon, authenticated;
grant execute on function public.hydration_reminders_due, public.claim_hydration_reminders to service_role;

-- ---------------------------------------------------------------------------
-- 2. Boutons des notifications
-- ---------------------------------------------------------------------------

-- payload : { "volumes": [200, 330] } (eau) ;
--           { "waterings": [{ "plant_id", "rule_id", "scheduled_on", "amount_ml" }] } (plantes à arroser).
create table public.notification_actions (
  token uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('water', 'plants')),
  payload jsonb not null,
  expires_at timestamptz not null default now() + interval '12 hours',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Réservée au serveur : aucun accès direct.
alter table public.notification_actions enable row level security;
revoke all on public.notification_actions from anon, authenticated;

-- Jeton d'une notification (clé de service) ; les jetons expirés sont supprimés au passage.
create function public.create_notification_action(p_profile_id uuid, p_kind text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  delete from public.notification_actions where expires_at < now();
  insert into public.notification_actions (profile_id, kind, payload)
  values (p_profile_id, p_kind, p_payload)
  returning token into v_token;
  return v_token;
end;
$$;

-- Geste demandé depuis une notification. p_action : « drink:<ml> » (un des contenants proposés) ou « watered ».
-- Renvoie de quoi confirmer : { "kind": "water", "volume_ml", "drunk_ml", "goal_ml" } ou { "kind": "plants", "count" }.
create function public.run_notification_action(p_token uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.notification_actions;
  v_volume integer;
  v_count integer;
  v_midnight timestamptz := ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris';
begin
  -- Verrouillé : deux appuis simultanés ne comptent qu'une fois.
  select * into v_action from public.notification_actions where token = p_token for update;
  if not found or v_action.expires_at < now() then
    raise exception 'Notification expirée' using errcode = 'P0002';
  end if;
  if v_action.used_at is not null then
    raise exception 'Déjà fait depuis cette notification' using errcode = '55000';
  end if;

  if v_action.kind = 'water' and p_action ~ '^drink:[0-9]{1,4}$' then
    v_volume := substring(p_action from 7)::integer;
    if not (v_action.payload -> 'volumes') @> to_jsonb(v_volume) then
      raise exception 'Contenant inconnu' using errcode = '22023';
    end if;
    insert into public.water_intakes (profile_id, volume_ml) values (v_action.profile_id, v_volume);
    update public.notification_actions set used_at = now() where token = p_token;
    return jsonb_build_object(
      'kind', 'water',
      'volume_ml', v_volume,
      'drunk_ml', (select coalesce(sum(volume_ml), 0) from public.water_intakes where profile_id = v_action.profile_id and drunk_at >= v_midnight),
      'goal_ml', coalesce((select hydration_goal_ml from public.user_settings where profile_id = v_action.profile_id), 1500)
    );
  end if;

  if v_action.kind = 'plants' and p_action = 'watered' then
    -- Échéances déjà notées (par l'autre, entre-temps) ou plantes supprimées : ignorées.
    with done as (
      insert into public.watering_events (plant_id, rule_id, scheduled_on, amount_ml, done_by)
      select w.plant_id, r.id, w.scheduled_on, w.amount_ml, v_action.profile_id
      from jsonb_to_recordset(v_action.payload -> 'waterings') as w(plant_id uuid, rule_id uuid, scheduled_on date, amount_ml integer)
      join public.plants p on p.id = w.plant_id
      left join public.watering_rules r on r.id = w.rule_id and r.plant_id = w.plant_id
      on conflict (plant_id, scheduled_on) do nothing
      returning 1
    )
    select count(*) into v_count from done;
    update public.notification_actions set used_at = now() where token = p_token;
    return jsonb_build_object('kind', 'plants', 'count', v_count);
  end if;

  raise exception 'Action inconnue' using errcode = '22023';
end;
$$;

revoke execute on function public.create_notification_action, public.run_notification_action from public, anon, authenticated;
grant execute on function public.create_notification_action to service_role;
-- Appelée par le service worker, sans session : le jeton fait foi.
grant execute on function public.run_notification_action to anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Ce que l'autre a fait
-- ---------------------------------------------------------------------------

-- Gestes des autres depuis p_since (3 jours par défaut), du plus récent au plus ancien (200 au plus).
--   watered           a arrosé une plante          title : plante        target : plante
--   plant_added       a ajouté une plante          title : plante        target : plante
--   planned           a planifié un repas          title : recette       detail : « 2026-11-10 LUNCH »
--   recipe_added      a ajouté une recette         title : recette       target : recette
--   shopping_added    a ajouté un article          title : article       detail : liste   target : liste
--   shopping_checked  a pris un article            title : article       detail : liste   target : liste
-- Tout est partagé entre les comptes, sauf le journal des courses (sans accès direct) : d'où security definer.
create function public.recent_activity(p_since timestamptz default now() - interval '3 days')
returns table (kind text, actor_id uuid, actor_name text, at timestamptz, title text, detail text, target_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with events as (
    select 'watered' as kind, e.done_by as actor_id, e.watered_at as at, p.name as title, null::text as detail, p.id as target_id
    from public.watering_events e join public.plants p on p.id = e.plant_id
    where e.created_at >= p_since
    union all
    select 'plant_added', p.created_by, p.created_at, p.name, null, p.id
    from public.plants p
    where p.created_at >= p_since
    union all
    select 'planned', m.created_by, m.created_at, r.title, m.meal_date::text || ' ' || m.slot::text, r.id
    from public.meals m join public.recipes r on r.id = m.recipe_id
    where m.created_at >= p_since
    union all
    select 'recipe_added', r.created_by, r.created_at, r.title, null, r.id
    from public.recipes r
    where r.is_saved and r.created_at >= p_since
    union all
    select case s.kind when 'ADDED' then 'shopping_added' else 'shopping_checked' end, s.actor_id, s.created_at, s.item_name, l.name, l.id
    from public.shopping_events s join public.shopping_lists l on l.id = s.list_id
    where s.kind in ('ADDED', 'CHECKED') and s.created_at >= p_since
  )
  select e.kind, e.actor_id, coalesce(pr.display_name, 'Quelqu’un'), e.at, e.title, e.detail, e.target_id
  from events e
  left join public.profiles pr on pr.id = e.actor_id
  where auth.uid() is not null
    and e.actor_id is distinct from auth.uid()
    and e.actor_id is not null
  order by e.at desc
  limit 200;
$$;

revoke execute on function public.recent_activity from public, anon;
grant execute on function public.recent_activity to authenticated;
