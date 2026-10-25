-- Notifications « l'autre a modifié la liste de courses » (Web Push), groupées après une pause.
--
--   shopping_items ──trigger──▶ shopping_events (journal)
--   pg_cron (toutes les 3 minutes, s'il y a des événements en attente) ──pg_net──▶ Edge Function notify-shopping
--   notify-shopping : regroupe par liste et par auteur, envoie aux appareils des autres (push_subscriptions).
--
-- L'adresse de la fonction et le secret partagé sont lus dans le Vault (à créer une fois par environnement) :
--   select vault.create_secret('<url de notify-shopping>', 'notify_shopping_url');
--   select vault.create_secret('<secret>', 'notify_shopping_secret');
-- Sans ces secrets (local, CI), la tâche ne fait rien.

create type public.shopping_event_kind as enum ('ADDED', 'CHECKED', 'UNCHECKED', 'UPDATED', 'REMOVED');

create table public.shopping_events (
  id bigint generated always as identity primary key,
  list_id uuid not null references public.shopping_lists on delete cascade,
  actor_id uuid not null references public.profiles on delete cascade,
  kind public.shopping_event_kind not null,
  item_name text not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create index shopping_events_pending_idx on public.shopping_events (list_id, actor_id) where notified_at is null;

-- Journal interne : aucun accès direct pour les utilisateurs (la fonction serveur utilise la clé de service).
alter table public.shopping_events enable row level security;
revoke all on public.shopping_events from anon, authenticated;

create function public.log_shopping_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_kind public.shopping_event_kind;
  v_list uuid;
  v_name text;
begin
  -- Modification sans utilisateur (service, maintenance) : rien à notifier.
  if v_actor is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_kind := 'ADDED';
    v_list := new.list_id;
    v_name := new.name;
  elsif tg_op = 'DELETE' then
    -- Liste supprimée (cascade) ou articles déjà dans le caddie retirés : pas de notification.
    if old.checked or not exists (select 1 from public.shopping_lists where id = old.list_id) then
      return null;
    end if;
    v_kind := 'REMOVED';
    v_list := old.list_id;
    v_name := old.name;
  else
    if new.checked is distinct from old.checked then
      v_kind := case when new.checked then 'CHECKED' else 'UNCHECKED' end;
    elsif (new.name, new.quantity, new.unit, new.aisle) is distinct from (old.name, old.quantity, old.unit, old.aisle) then
      v_kind := 'UPDATED';
    else
      return null; -- simple changement d'ordre
    end if;
    v_list := new.list_id;
    v_name := new.name;
  end if;

  insert into public.shopping_events (list_id, actor_id, kind, item_name) values (v_list, v_actor, v_kind, v_name);
  return null;
end;
$$;

create trigger shopping_items_log_event
  after insert or update or delete on public.shopping_items
  for each row execute function public.log_shopping_event();

-- Appareils abonnés aux notifications (un par téléphone ou navigateur).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null check (btrim(p256dh) <> ''),
  auth text not null check (btrim(auth) <> ''),
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy "mes appareils" on public.push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.push_subscriptions from anon;
grant select, delete on public.push_subscriptions to authenticated;

-- Enregistre (ou réattribue, si le téléphone change de compte) l'abonnement de cet appareil.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_push_subscription, public.log_shopping_event from public, anon;
grant execute on function public.save_push_subscription to authenticated;

-- Tâche planifiée : appelle notify-shopping toutes les 3 minutes, seulement s'il y a des événements en attente
-- et si le Vault contient l'adresse et le secret de la fonction.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'notify-shopping',
  '*/3 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_url'),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_url')
      and exists (select 1 from public.shopping_events where notified_at is null)
  $cron$
);
