-- Écran des recettes : historique (repas du planning) et avis de chacun (note, commentaire).

-- 1. Avis ------------------------------------------------------------------------------------------------------
-- Une note (1 à 5) et / ou un commentaire par personne et par recette. Lisibles par tous, chacun n'écrit que le sien.
create table public.recipe_reviews (
  recipe_id uuid not null references public.recipes on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles on delete cascade,
  rating smallint check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) between 1 and 1000),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, profile_id),
  check (rating is not null or comment is not null)
);
create index recipe_reviews_profile_idx on public.recipe_reviews (profile_id);

create trigger recipe_reviews_updated_at
  before update on public.recipe_reviews
  for each row execute function public.set_updated_at();

alter table public.recipe_reviews enable row level security;
create policy "avis lisibles par les connectés" on public.recipe_reviews for select to authenticated using (true);
create policy "chacun ajoute son avis" on public.recipe_reviews for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "chacun modifie son avis" on public.recipe_reviews for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "chacun retire son avis" on public.recipe_reviews for delete to authenticated using (profile_id = (select auth.uid()));

revoke all on public.recipe_reviews from anon;
grant select, insert, update, delete on public.recipe_reviews to authenticated;

-- Enregistre l'avis de la personne connectée ; sans note ni commentaire, il est retiré.
create function public.save_recipe_review(p_recipe_id uuid, p_rating int default null, p_comment text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_comment text := nullif(btrim(p_comment), '');
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_rating is null and v_comment is null then
    delete from public.recipe_reviews where recipe_id = p_recipe_id and profile_id = auth.uid();
    return;
  end if;
  insert into public.recipe_reviews (recipe_id, profile_id, rating, comment)
  values (p_recipe_id, auth.uid(), p_rating, v_comment)
  on conflict (recipe_id, profile_id) do update set rating = excluded.rating, comment = excluded.comment;
end;
$$;

-- 2. Historique ----------------------------------------------------------------------------------------------
-- Par recette (toutes, ou une seule) : nombre de repas passés (jusqu'à aujourd'hui inclus), le dernier, et le
-- prochain prévu. « Aujourd'hui » est la date de l'appareil (fuseau de l'utilisateur), pas celle du serveur.
create function public.recipe_history(p_today date, p_recipe_id uuid default null)
returns table (recipe_id uuid, times_cooked int, last_cooked date, next_planned date)
language sql
stable
set search_path = ''
as $$
  select m.recipe_id,
    (count(*) filter (where m.meal_date <= p_today))::int,
    max(m.meal_date) filter (where m.meal_date <= p_today),
    min(m.meal_date) filter (where m.meal_date > p_today)
  from public.meals m
  where p_today is not null and (p_recipe_id is null or m.recipe_id = p_recipe_id)
  group by m.recipe_id
$$;

revoke execute on function public.save_recipe_review, public.recipe_history from public, anon;
grant execute on function public.save_recipe_review, public.recipe_history to authenticated;
