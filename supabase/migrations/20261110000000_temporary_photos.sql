-- Photos d'une recette ponctuelle (éléments « À planifier » créés depuis des photos, rangées dans pending/) :
-- elles ne servent qu'en attendant que la recette soit enregistrée.
--   - recette ponctuelle sauvegardée (devient une vraie recette) : ses photos pending/ sont retirées ;
--   - recette ponctuelle remplacée ou repas supprimé : retirées avec elle (cascade) ;
--   - repas dupliqué : la copie garde les photos (mêmes fichiers) ;
--   - fichiers que plus rien n'utilise (photos temporaires, photos d'une recette supprimée, PDF de tricot) :
--     supprimés chaque nuit (notify-shopping, {"job": "cleanup"}).

create function public.drop_temporary_photos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.recipe_photos where recipe_id = new.id and storage_path like 'pending/%';
  return null;
end;
$$;

create trigger recipes_drop_temporary_photos
  after update of is_saved on public.recipes
  for each row when (not old.is_saved and new.is_saved)
  execute function public.drop_temporary_photos();

revoke execute on function public.drop_temporary_photos from public, anon, authenticated;

-- Une photo pending/ peut être partagée par un repas et sa copie : le fichier est supprimé par le ménage de nuit
-- quand plus rien ne l'utilise (les autres photos restent propres à une recette).
alter table public.recipe_photos drop constraint recipe_photos_storage_path_key;
create unique index recipe_photos_storage_path_key on public.recipe_photos (storage_path) where storage_path not like 'pending/%';

-- Une recette ponctuelle est copiée (chaque recette ponctuelle appartient à un seul repas), avec ses photos.
create or replace function public.duplicate_meal(
  p_meal_id uuid,
  p_meal_date date,
  p_slot public.meal_slot
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_src record;
  v_recipe_id uuid;
  v_meal_id uuid;
begin
  select m.people, m.recipe_id, r.is_saved, r.title, r.notes, r.url into v_src
  from public.meals m join public.recipes r on r.id = m.recipe_id
  where m.id = p_meal_id;

  if not found then
    raise exception 'Repas introuvable' using errcode = 'P0002';
  end if;

  if v_src.is_saved then
    v_recipe_id := v_src.recipe_id;
  else
    insert into public.recipes (is_saved, title, notes, url)
    values (false, v_src.title, v_src.notes, v_src.url)
    returning id into v_recipe_id;
    insert into public.recipe_photos (recipe_id, storage_path, position)
    select v_recipe_id, p.storage_path, p.position from public.recipe_photos p where p.recipe_id = v_src.recipe_id;
  end if;

  insert into public.meals (meal_date, slot, people, recipe_id)
  values (p_meal_date, p_slot, v_src.people, v_recipe_id)
  returning id into v_meal_id;

  return v_meal_id;
end;
$$;

-- Fichiers encore utilisés d'un bucket : photos des recettes et des éléments « À planifier », PDF des projets de tricot.
create function public.referenced_files(p_bucket text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select storage_path from public.recipe_photos where p_bucket = 'recipe-photos'
  union
  select unnest(photos) from public.planning_inbox where p_bucket = 'recipe-photos'
  union
  select pdf_path from public.knit_projects where p_bucket = 'knit-patterns' and pdf_path is not null
$$;
revoke execute on function public.referenced_files from public, anon, authenticated;
grant execute on function public.referenced_files to service_role;

select cron.schedule(
  'cleanup-photos',
  '0 3 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_url'),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_shopping_secret')
      ),
      body := '{"job": "cleanup"}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'notify_shopping_secret')
  $cron$
);
