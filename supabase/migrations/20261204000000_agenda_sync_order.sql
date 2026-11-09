-- Agenda : début de la dernière tentative de synchronisation de chaque source. Noté avant de la traiter : si la
-- fonction est arrêtée en cours (limite de temps ou de mémoire, agenda très lourd), la source passe après les autres
-- au passage suivant au lieu de les bloquer. Écrit par le serveur seulement (sync-calendars).

alter table public.calendar_sources add column sync_started_at timestamptz;
create index calendar_sources_sync_idx on public.calendar_sources (sync_started_at nulls first);
