-- Agenda : description des événements (texte, sans mise en forme), affichée dans le détail d'un rendez-vous.
-- Remplie par la synchronisation suivante (sync-calendars) ; vide d'ici là.

alter table public.calendar_events
  add column description text check (description is null or char_length(description) <= 4000);

create or replace function public.replace_calendar_events(p_source_id uuid, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.calendar_events where source_id = p_source_id;
  insert into public.calendar_events (source_id, uid, title, location, description, all_day, starts_at, ends_at, start_date, end_date)
  select p_source_id, e.uid, e.title, e.location, e.description, e."allDay", e."startsAt", e."endsAt", e."startDate", e."endDate"
  from jsonb_to_recordset(p_events) as e(
    uid text, title text, location text, description text, "allDay" boolean, "startsAt" timestamptz, "endsAt" timestamptz, "startDate" date, "endDate" date
  )
  on conflict (source_id, uid) do nothing;
  update public.calendar_sources set last_synced_at = now(), last_error = null where id = p_source_id;
end;
$$;

revoke execute on function public.replace_calendar_events from public, anon, authenticated;
grant execute on function public.replace_calendar_events to service_role;

-- Synchronisation complète au prochain passage (les descriptions arrivent tout de suite).
update public.calendar_sources set last_synced_at = null;
