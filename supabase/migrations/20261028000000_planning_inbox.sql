-- Liste « À planifier » partagée : liens, recettes enregistrées ou simples idées, à répartir ensuite
-- sur les créneaux du planning. Un élément planifié disparaît de la liste.

create table public.planning_inbox (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  url text check (url is null or url ~* '^https?://'),
  recipe_id uuid references public.recipes on delete cascade,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint planning_inbox_recipe_or_url check (recipe_id is null or url is null)
);
create index planning_inbox_created_idx on public.planning_inbox (created_at);
-- Pas deux fois le même lien ni la même recette dans la liste
create unique index planning_inbox_url_unique on public.planning_inbox (public.recipe_url_key(url)) where url is not null;
create unique index planning_inbox_recipe_unique on public.planning_inbox (recipe_id) where recipe_id is not null;

alter table public.planning_inbox enable row level security;
create policy "liste à planifier partagée" on public.planning_inbox for all to authenticated using (true) with check (true);
revoke all on public.planning_inbox from anon;
grant select, insert, update, delete on public.planning_inbox to authenticated;
alter publication supabase_realtime add table public.planning_inbox;

-- Ajoute un élément. Un lien déjà enregistré comme recette devient un élément « recette ».
create function public.add_to_inbox(p_title text default null, p_url text default null, p_recipe_id uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_title text := nullif(btrim(p_title), '');
  v_url text := nullif(btrim(p_url), '');
  v_recipe uuid := p_recipe_id;
  v_id uuid;
begin
  if v_recipe is null and v_url is not null then
    select f.id into v_recipe from public.find_saved_recipe_by_url(v_url) f;
  end if;
  if v_recipe is not null then
    select r.title into v_title from public.recipes r where r.id = v_recipe and r.is_saved;
    if v_title is null then
      raise exception 'Recette sauvegardée introuvable' using errcode = 'P0002';
    end if;
    v_url := null;
  end if;
  if v_title is null then
    raise exception 'Titre requis' using errcode = '22023';
  end if;

  insert into public.planning_inbox (title, url, recipe_id)
  values (left(v_title, 200), v_url, v_recipe)
  returning id into v_id;
  return v_id;
end;
$$;

-- Planifie un élément : crée le repas et retire l'élément de la liste, en une seule transaction.
create function public.plan_inbox_item(p_item_id uuid, p_meal_date date, p_slot public.meal_slot, p_people uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_item public.planning_inbox;
  v_meal uuid;
begin
  select * into v_item from public.planning_inbox where id = p_item_id for update;
  if not found then
    raise exception 'Élément introuvable' using errcode = 'P0002';
  end if;

  v_meal := public.create_meal(
    p_meal_date,
    p_slot,
    p_people,
    p_recipe_id => v_item.recipe_id,
    p_adhoc_title => case when v_item.recipe_id is null then v_item.title end,
    p_adhoc_url => v_item.url
  );
  delete from public.planning_inbox where id = p_item_id;
  return v_meal;
end;
$$;

revoke execute on function public.add_to_inbox, public.plan_inbox_item from public, anon;
grant execute on function public.add_to_inbox, public.plan_inbox_item to authenticated;
