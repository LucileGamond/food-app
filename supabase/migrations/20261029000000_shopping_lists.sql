-- Listes de courses partagées : articles avec quantité, unité (même liste que les recettes) et rayon.

create type public.shopping_aisle as enum (
  'FRUITS_LEGUMES', 'BOULANGERIE', 'BOUCHERIE_POISSON', 'CREMERIE', 'EPICERIE_SALEE',
  'EPICERIE_SUCREE', 'SURGELES', 'BOISSONS', 'HYGIENE_MAISON', 'AUTRE'
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger shopping_lists_updated_at before update on public.shopping_lists
  for each row execute function public.set_updated_at();

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  quantity numeric check (quantity is null or (quantity > 0 and quantity < 100000)),
  -- ⚠ Même liste que src/lib/units.ts (vérifié par un test)
  unit text check (unit is null or unit in ('g', 'kg', 'ml', 'cl', 'dl', 'l', 'c. à c.', 'c. à s.', 'pincée', 'gousse', 'tranche', 'sachet', 'boîte', 'botte', 'brin', 'feuille', 'verre', 'tasse', 'bol', 'poignée', 'noix', 'filet', 'morceau')),
  aisle public.shopping_aisle not null default 'AUTRE',
  checked boolean not null default false,
  position int not null default 0,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shopping_items_list_idx on public.shopping_items (list_id, position);

create trigger shopping_items_updated_at before update on public.shopping_items
  for each row execute function public.set_updated_at();

-- Toute modification d'un article rafraîchit la date de la liste (tri des listes par activité).
create function public.touch_shopping_list()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.shopping_lists set updated_at = now()
  where id = coalesce(new.list_id, old.list_id);
  return null;
end;
$$;

create trigger shopping_items_touch_list
  after insert or update or delete on public.shopping_items
  for each row execute function public.touch_shopping_list();

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
create policy "listes de courses partagées" on public.shopping_lists for all to authenticated using (true) with check (true);
create policy "articles partagés" on public.shopping_items for all to authenticated using (true) with check (true);
revoke all on public.shopping_lists, public.shopping_items from anon;
grant select, insert, update, delete on public.shopping_lists, public.shopping_items to authenticated;

alter publication supabase_realtime add table public.shopping_lists, public.shopping_items;
