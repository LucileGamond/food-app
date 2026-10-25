-- Durcissement issu de la revue de code.

-- 1. Abonnements Web Push ----------------------------------------------------------------------------------
-- Un appareil déjà enregistré ne peut être repris que par son propriétaire, ou par le même navigateur
-- (mêmes clés : le téléphone change de compte). L'adresse doit être celle d'un service de notification
-- de navigateur (sinon la fonction notify-shopping enverrait des requêtes vers n'importe quelle adresse).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
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
  if p_endpoint is null
    or length(p_endpoint) > 1000
    or p_endpoint !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com|web\.push\.apple\.com)/'
  then
    raise exception 'Service de notification non reconnu' using errcode = '22023';
  end if;
  if length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Clés de notification invalides' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
    where public.push_subscriptions.profile_id = auth.uid()
      or (public.push_subscriptions.p256dh = excluded.p256dh and public.push_subscriptions.auth = excluded.auth)
  returning id into v_id;

  if v_id is null then
    raise exception 'Cet appareil est déjà associé à un autre compte' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

-- Écriture uniquement par save_push_subscription (les droits par défaut donnaient aussi insert / update).
revoke insert, update on public.push_subscriptions from authenticated;

-- 2. Fonctions utilitaires : pas d'appel anonyme par l'API ------------------------------------------------
revoke execute on function public.recipe_url_key(text), public.unit_key(text), public.normalize_unit(text), public.split_unit(text) from public, anon;
grant execute on function public.recipe_url_key(text), public.unit_key(text), public.normalize_unit(text), public.split_unit(text) to authenticated;

-- 3. Planifier un lien « À planifier » devenu entre-temps une recette sauvegardée : la recette est utilisée
--    (plutôt qu'une recette ponctuelle en double).
create or replace function public.plan_inbox_item(p_item_id uuid, p_meal_date date, p_slot public.meal_slot, p_people uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_item public.planning_inbox;
  v_recipe uuid;
  v_meal uuid;
begin
  select * into v_item from public.planning_inbox where id = p_item_id for update;
  if not found then
    raise exception 'Élément introuvable' using errcode = 'P0002';
  end if;

  v_recipe := v_item.recipe_id;
  if v_recipe is null and v_item.url is not null then
    select f.id into v_recipe from public.find_saved_recipe_by_url(v_item.url) f limit 1;
  end if;

  v_meal := public.create_meal(
    p_meal_date,
    p_slot,
    p_people,
    p_recipe_id => v_recipe,
    p_adhoc_title => case when v_recipe is null then v_item.title end,
    p_adhoc_url => case when v_recipe is null then v_item.url end
  );
  delete from public.planning_inbox where id = p_item_id;
  return v_meal;
end;
$$;
