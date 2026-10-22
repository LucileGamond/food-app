-- Schéma initial : profils, recettes (ponctuelles / sauvegardées), planning des repas.
-- Règles métier garanties côté base (testées dans supabase/tests).

create type public.meal_slot as enum ('LUNCH', 'DINNER');

-- ---------------------------------------------------------------------------
-- Profils (1 par utilisateur Auth, créé automatiquement)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Recettes
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  is_saved boolean not null default false,
  title text not null check (btrim(title) <> ''),
  notes text,
  url text check (url is null or url ~* '^https?://'),
  servings int check (servings is null or servings > 0),
  tags text[] not null default '{}',
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_is_saved_idx on public.recipes (is_saved);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes on delete cascade,
  position int not null check (position >= 0),
  name text not null check (btrim(name) <> ''),
  quantity numeric check (quantity is null or quantity > 0),
  unit text
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);

create table public.recipe_photos (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes on delete cascade,
  storage_path text not null unique,
  position int not null check (position >= 0),
  created_at timestamptz not null default now()
);
create index recipe_photos_recipe_idx on public.recipe_photos (recipe_id, position);

-- ---------------------------------------------------------------------------
-- Repas du planning
-- ---------------------------------------------------------------------------
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  meal_date date not null,
  slot public.meal_slot not null,
  people uuid[] not null check (cardinality(people) > 0),
  recipe_id uuid not null references public.recipes on delete restrict,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meals_date_idx on public.meals (meal_date);
create index meals_recipe_idx on public.meals (recipe_id);

-- Toutes les personnes d'un repas doivent être des profils existants.
create function public.check_meal_people()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.people) as p(id)
    where not exists (select 1 from public.profiles pr where pr.id = p.id)
  ) then
    raise exception 'Personne inconnue dans le repas' using errcode = '23503';
  end if;
  new.people := array(select distinct unnest(new.people) order by 1);
  return new;
end;
$$;

create trigger meals_check_people
  before insert or update of people on public.meals
  for each row execute function public.check_meal_people();

-- updated_at automatique
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger meals_updated_at before update on public.meals
  for each row execute function public.set_updated_at();

-- Une recette ponctuelle qui n'est plus utilisée par aucun repas est supprimée.
create function public.cleanup_adhoc_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.recipes r
  where r.id = old.recipe_id
    and not r.is_saved
    and not exists (select 1 from public.meals m where m.recipe_id = old.recipe_id);
  return null;
end;
$$;

create trigger meals_cleanup_adhoc_after_delete
  after delete on public.meals
  for each row execute function public.cleanup_adhoc_recipe();
create trigger meals_cleanup_adhoc_after_update
  after update of recipe_id on public.meals
  for each row when (old.recipe_id is distinct from new.recipe_id)
  execute function public.cleanup_adhoc_recipe();

-- ---------------------------------------------------------------------------
-- Fonctions métier (atomiques, exécutées avec les droits de l'appelant)
-- ---------------------------------------------------------------------------

-- Crée un repas, soit à partir d'une recette sauvegardée (p_recipe_id),
-- soit avec une nouvelle recette ponctuelle (p_adhoc_title / notes / url).
create function public.create_meal(
  p_meal_date date,
  p_slot public.meal_slot,
  p_people uuid[],
  p_recipe_id uuid default null,
  p_adhoc_title text default null,
  p_adhoc_notes text default null,
  p_adhoc_url text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_recipe_id uuid := p_recipe_id;
  v_meal_id uuid;
begin
  if (p_recipe_id is null) = (p_adhoc_title is null) then
    raise exception 'Il faut soit une recette sauvegardée, soit une recette ponctuelle' using errcode = '22023';
  end if;

  if p_recipe_id is not null then
    if not exists (select 1 from public.recipes where id = p_recipe_id and is_saved) then
      raise exception 'Recette sauvegardée introuvable' using errcode = 'P0002';
    end if;
  else
    insert into public.recipes (is_saved, title, notes, url)
    values (false, btrim(p_adhoc_title), nullif(btrim(p_adhoc_notes), ''), nullif(btrim(p_adhoc_url), ''))
    returning id into v_recipe_id;
  end if;

  insert into public.meals (meal_date, slot, people, recipe_id)
  values (p_meal_date, p_slot, p_people, v_recipe_id)
  returning id into v_meal_id;

  return v_meal_id;
end;
$$;

-- Modifie les personnes et la recette d'un repas.
-- Recette ponctuelle : mise à jour sur place si le repas en avait déjà une, sinon création.
create function public.update_meal(
  p_meal_id uuid,
  p_people uuid[],
  p_recipe_id uuid default null,
  p_adhoc_title text default null,
  p_adhoc_notes text default null,
  p_adhoc_url text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_current record;
  v_recipe_id uuid;
begin
  if (p_recipe_id is null) = (p_adhoc_title is null) then
    raise exception 'Il faut soit une recette sauvegardée, soit une recette ponctuelle' using errcode = '22023';
  end if;

  select m.recipe_id, r.is_saved into v_current
  from public.meals m join public.recipes r on r.id = m.recipe_id
  where m.id = p_meal_id
  for update of m;

  if not found then
    raise exception 'Repas introuvable' using errcode = 'P0002';
  end if;

  if p_recipe_id is not null then
    if not exists (select 1 from public.recipes where id = p_recipe_id and is_saved) then
      raise exception 'Recette sauvegardée introuvable' using errcode = 'P0002';
    end if;
    v_recipe_id := p_recipe_id;
  elsif not v_current.is_saved then
    update public.recipes
    set title = btrim(p_adhoc_title),
        notes = nullif(btrim(p_adhoc_notes), ''),
        url = nullif(btrim(p_adhoc_url), '')
    where id = v_current.recipe_id;
    v_recipe_id := v_current.recipe_id;
  else
    insert into public.recipes (is_saved, title, notes, url)
    values (false, btrim(p_adhoc_title), nullif(btrim(p_adhoc_notes), ''), nullif(btrim(p_adhoc_url), ''))
    returning id into v_recipe_id;
  end if;

  update public.meals
  set people = p_people, recipe_id = v_recipe_id
  where id = p_meal_id;
end;
$$;

-- Duplique un repas vers un autre jour / créneau.
-- Une recette ponctuelle est copiée : chaque recette ponctuelle appartient à un seul repas.
create function public.duplicate_meal(
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
  end if;

  insert into public.meals (meal_date, slot, people, recipe_id)
  values (p_meal_date, p_slot, v_src.people, v_recipe_id)
  returning id into v_meal_id;

  return v_meal_id;
end;
$$;

-- Crée ou met à jour une recette sauvegardée avec ses ingrédients (remplacés en bloc).
-- Avec p_recipe_id d'une recette ponctuelle, la transforme en recette sauvegardée.
create function public.save_recipe(
  p_title text,
  p_ingredients jsonb,
  p_recipe_id uuid default null,
  p_notes text default null,
  p_url text default null,
  p_servings int default null,
  p_tags text[] default '{}'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := p_recipe_id;
begin
  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'Une recette sauvegardée doit avoir au moins un ingrédient' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.recipes (is_saved, title, notes, url, servings, tags)
    values (true, btrim(p_title), nullif(btrim(p_notes), ''), nullif(btrim(p_url), ''), p_servings, coalesce(p_tags, '{}'))
    returning id into v_id;
  else
    update public.recipes
    set is_saved = true,
        title = btrim(p_title),
        notes = nullif(btrim(p_notes), ''),
        url = nullif(btrim(p_url), ''),
        servings = p_servings,
        tags = coalesce(p_tags, '{}')
    where id = v_id;
    if not found then
      raise exception 'Recette introuvable' using errcode = 'P0002';
    end if;
    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients (recipe_id, position, name, quantity, unit)
  select v_id, (e.ord - 1)::int, btrim(e.value ->> 'name'), nullif(e.value ->> 'quantity', '')::numeric, nullif(btrim(e.value ->> 'unit'), '')
  from jsonb_array_elements(p_ingredients) with ordinality as e(value, ord);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sécurité : planning partagé entre les utilisateurs connectés uniquement
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_photos enable row level security;
alter table public.meals enable row level security;

create policy "profiles lisibles par les connectés" on public.profiles
  for select to authenticated using (true);

create policy "recettes partagées" on public.recipes
  for all to authenticated using (true) with check (true);
create policy "ingrédients partagés" on public.recipe_ingredients
  for all to authenticated using (true) with check (true);
create policy "photos partagées" on public.recipe_photos
  for all to authenticated using (true) with check (true);
create policy "repas partagés" on public.meals
  for all to authenticated using (true) with check (true);

revoke all on public.profiles, public.recipes, public.recipe_ingredients, public.recipe_photos, public.meals from anon;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.recipes, public.recipe_ingredients, public.recipe_photos, public.meals to authenticated;

revoke execute on function public.create_meal, public.update_meal, public.duplicate_meal, public.save_recipe from public, anon;
grant execute on function public.create_meal, public.update_meal, public.duplicate_meal, public.save_recipe to authenticated;
revoke execute on function public.handle_new_user from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stockage des photos (bucket privé)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "photos lisibles par les connectés" on storage.objects
  for select to authenticated using (bucket_id = 'recipe-photos');
create policy "photos ajoutées par les connectés" on storage.objects
  for insert to authenticated with check (bucket_id = 'recipe-photos');
create policy "photos supprimées par les connectés" on storage.objects
  for delete to authenticated using (bucket_id = 'recipe-photos');

-- ---------------------------------------------------------------------------
-- Temps réel
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.meals, public.recipes;
