-- Tâche notify-shopping : n'appeler la fonction que si le Vault contient aussi le secret partagé (sinon chaque appel
-- serait refusé, toutes les 3 minutes). cron.schedule remplace la tâche du même nom.
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
      and exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_secret')
      and exists (select 1 from public.shopping_events where notified_at is null)
  $cron$
);
