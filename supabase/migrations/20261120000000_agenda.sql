-- Module Agenda : les agendas Google de chacun, en lecture seule, synchronisés par l'Edge Function sync-calendars.
--
--   calendar_sources               un agenda suivi (propriétaire, nom, état de la dernière synchronisation) : visible par le foyer,
--                                  supprimé par son propriétaire seulement
--   calendar_source_credentials    l'accès à sa source (adresse iCal secrète ; jetons OAuth plus tard) : serveur seulement
--   calendar_events                occurrences de la semaine passée aux deux mois à venir : visibles par le foyer
--
--   pg_cron (toutes les 15 minutes) ──pg_net──▶ sync-calendars          (même secret que notify-shopping)
--   pg_cron (toutes les heures)      ──pg_net──▶ notify-shopping {"job": "agenda"}   résumé du matin, une fois par jour dès 7 h
--
-- Fournisseurs : « ical » aujourd'hui. La connexion Google (OAuth) ajoutera le fournisseur « google » et ses jetons
-- dans calendar_source_credentials, sans changer les événements ni l'application.

-- ---------------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------------

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade default auth.uid(),
  provider text not null check (provider in ('ical')),
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  last_synced_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now()
);
create index calendar_sources_owner_idx on public.calendar_sources (owner_id);

alter table public.calendar_sources enable row level security;
create policy "agendas visibles par le foyer" on public.calendar_sources
  for select to authenticated using (true);
create policy "mes agendas supprimés" on public.calendar_sources
  for delete to authenticated using (owner_id = auth.uid());

revoke all on public.calendar_sources from anon, authenticated;
-- Ajout par add_ical_calendar seulement (la source et son accès ensemble) ; l'état de synchronisation est au serveur.
grant select, delete on public.calendar_sources to authenticated;

-- Accès : jamais lisibles depuis l'application (pas de droit, pas de règle), même par leur propriétaire.
create table public.calendar_source_credentials (
  source_id uuid primary key references public.calendar_sources on delete cascade,
  ical_url text check (ical_url ~ '^https://calendar\.google\.com/calendar/ical/[^/?#\s]+/[^/?#\s]+/basic\.ics$'),
  updated_at timestamptz not null default now()
);
alter table public.calendar_source_credentials enable row level security;
revoke all on public.calendar_source_credentials from anon, authenticated;

-- Ajoute un agenda Google par son adresse iCal secrète ; renvoie l'id de la source.
create function public.add_ical_calendar(p_name text, p_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'connexion requise' using errcode = '42501';
  end if;
  insert into public.calendar_sources (owner_id, provider, name)
  values (auth.uid(), 'ical', btrim(p_name))
  returning id into v_id;
  insert into public.calendar_source_credentials (source_id, ical_url) values (v_id, btrim(p_url));
  return v_id;
end;
$$;

revoke execute on function public.add_ical_calendar from public, anon;
grant execute on function public.add_ical_calendar to authenticated;

-- ---------------------------------------------------------------------------
-- Événements (occurrences déjà dépliées par la synchronisation : récurrences, exceptions et fuseaux)
-- ---------------------------------------------------------------------------

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.calendar_sources on delete cascade,
  uid text not null check (char_length(uid) between 1 and 1000),
  title text not null check (char_length(title) between 1 and 500),
  location text check (location is null or char_length(location) <= 500),
  all_day boolean not null,
  -- Rendez-vous : instants ; journée entière : jours (fin exclue).
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  unique (source_id, uid),
  check (
    (all_day and start_date is not null and end_date > start_date and starts_at is null and ends_at is null)
    or (not all_day and starts_at is not null and ends_at >= starts_at and start_date is null and end_date is null)
  )
);
create index calendar_events_timed_idx on public.calendar_events (starts_at) where not all_day;
create index calendar_events_all_day_idx on public.calendar_events (start_date, end_date) where all_day;

alter table public.calendar_events enable row level security;
create policy "événements visibles par le foyer" on public.calendar_events
  for select to authenticated using (true);
revoke all on public.calendar_events from anon, authenticated;
grant select on public.calendar_events to authenticated;

-- Remplace d'un bloc les occurrences d'une source (synchronisation réussie). p_events : tableau d'occurrences
-- {uid, title, location, allDay, startsAt, endsAt, startDate, endDate} (voir _shared/agenda/occurrence.ts).
create function public.replace_calendar_events(p_source_id uuid, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.calendar_events where source_id = p_source_id;
  insert into public.calendar_events (source_id, uid, title, location, all_day, starts_at, ends_at, start_date, end_date)
  select p_source_id, e.uid, e.title, e.location, e."allDay", e."startsAt", e."endsAt", e."startDate", e."endDate"
  from jsonb_to_recordset(p_events) as e(
    uid text, title text, location text, "allDay" boolean, "startsAt" timestamptz, "endsAt" timestamptz, "startDate" date, "endDate" date
  )
  on conflict (source_id, uid) do nothing;
  update public.calendar_sources set last_synced_at = now(), last_error = null where id = p_source_id;
end;
$$;

revoke execute on function public.replace_calendar_events from public, anon, authenticated;
grant execute on function public.replace_calendar_events to service_role;

-- La page se met à jour à chaque synchronisation (la source change : last_synced_at).
alter publication supabase_realtime add table public.calendar_sources;

-- ---------------------------------------------------------------------------
-- Réglages : page « Agenda » (masquée par défaut), agendas affichés, résumé du matin
-- ---------------------------------------------------------------------------

alter table public.user_settings drop constraint user_settings_disabled_pages_check;
alter table public.user_settings add constraint user_settings_disabled_pages_check
  check (disabled_pages <@ array['planning', 'recettes', 'plan', 'courses', 'poids', 'hydratation', 'tricot', 'plantes', 'agenda']);
alter table public.user_settings alter column disabled_pages set default '{hydratation,tricot,plantes,agenda}';
update public.user_settings set disabled_pages = array_append(disabled_pages, 'agenda') where not ('agenda' = any (disabled_pages));

alter table public.user_settings drop constraint user_settings_muted_notifications_check;
alter table public.user_settings add constraint user_settings_muted_notifications_check
  check (muted_notifications <@ array['courses', 'hydratation', 'plantes', 'agenda']);

-- Agendas affichés (accueil, page, résumé) : les miens, ceux de l'autre, les deux.
alter table public.user_settings add column agenda_scope text not null default 'all' check (agenda_scope in ('mine', 'other', 'all'));
grant insert (agenda_scope), update (agenda_scope) on public.user_settings to authenticated;

-- Jour (heure de Paris) du dernier résumé du matin : un seul par jour, écrit par le serveur seulement.
alter table public.user_settings add column agenda_reminded_on date;

-- Personnes à qui envoyer le résumé du jour : page affichée, notifications non coupées, un appareil abonné, pas
-- encore prévenues aujourd'hui, et pas avant 7 h (heure de Paris). Les rendez-vous sont choisis par la fonction.
create function public.agenda_reminders_due(p_now timestamptz default now())
returns table (profile_id uuid, agenda_scope text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.profile_id, s.agenda_scope
  from public.user_settings s
  where not ('agenda' = any (s.disabled_pages))
    and not ('agenda' = any (s.muted_notifications))
    and (p_now at time zone 'Europe/Paris')::time >= time '07:00'
    and (s.agenda_reminded_on is null or s.agenda_reminded_on < (p_now at time zone 'Europe/Paris')::date)
    and exists (select 1 from public.push_subscriptions p where p.profile_id = s.profile_id);
$$;

-- Réserve les résumés du jour (date notée) : deux exécutions simultanées n'envoient pas le même.
create function public.claim_agenda_reminders(p_now timestamptz default now())
returns table (profile_id uuid, agenda_scope text)
language sql
security definer
set search_path = ''
as $$
  update public.user_settings s
  set agenda_reminded_on = (p_now at time zone 'Europe/Paris')::date
  from public.agenda_reminders_due(p_now) due
  where s.profile_id = due.profile_id
    and (s.agenda_reminded_on is null or s.agenda_reminded_on < (p_now at time zone 'Europe/Paris')::date)
  returning s.profile_id, s.agenda_scope;
$$;

revoke execute on function public.agenda_reminders_due, public.claim_agenda_reminders from public, anon, authenticated;
grant execute on function public.agenda_reminders_due, public.claim_agenda_reminders to service_role;

-- ---------------------------------------------------------------------------
-- Tâches planifiées (adresse de sync-calendars déduite de celle de notify-shopping : rien de plus à configurer)
-- ---------------------------------------------------------------------------

select cron.schedule(
  'sync-calendars',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_url'), '/notify-shopping', '/sync-calendars'),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_secret')
      and exists (select 1 from public.calendar_sources)
  $cron$
);

select cron.schedule(
  'notify-agenda',
  '10 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_url'),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_secret')
      ),
      body := '{"job": "agenda"}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_secret')
      and exists (select 1 from public.agenda_reminders_due())
  $cron$
);
