-- Mode cuisine : progression enregistrée (recette faite sur plusieurs jours, reprise sur un autre appareil).
-- Une progression par recette, partagée comme les recettes ; retirée quand la recette est terminée.
create table public.cooking_progress (
  recipe_id uuid primary key references public.recipes on delete cascade,
  -- Positions des ingrédients et numéros (à partir de 0) des étapes cochés.
  ingredients int[] not null default '{}' check (cardinality(ingredients) <= 500),
  steps int[] not null default '{}' check (cardinality(steps) <= 500),
  -- Nombre de personnes choisi (quantités), null : celui de la recette.
  people int check (people between 1 and 99),
  updated_at timestamptz not null default now()
);

create trigger cooking_progress_updated_at
  before update on public.cooking_progress
  for each row execute function public.set_updated_at();

alter table public.cooking_progress enable row level security;
create policy "progression partagée" on public.cooking_progress for all to authenticated using (true) with check (true);

revoke all on public.cooking_progress from anon;
grant select, insert, update, delete on public.cooking_progress to authenticated;
