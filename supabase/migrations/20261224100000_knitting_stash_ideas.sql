-- Tricot : idées de modèles gardées pour une laine du stock, ou plusieurs laines associées (« Des idées pour ma laine »).
-- Les idées coûtent un appel au modèle : on les garde pour les revoir sans repayer, jusqu'à ce qu'on les relance.
--
--   knit_stash_ideas.stash_ids   laines du stock concernées, triées (1 à 4) ; une seule ligne par ensemble de laines
--   knit_stash_ideas.wish        envie donnée au modèle (« un snood »), ou ''
--   knit_stash_ideas.ideas       idées : [{ title, why, size, meters, needleMm, search, patterns: [{ title, url, free, language }] }]
--   knit_stash_ideas.weight      grosseur de la laine (catégorie Ravelry), pour la recherche filtrée
--
-- Une laine retirée du stock emporte les idées qui la concernent.

create table public.knit_stash_ideas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade default auth.uid(),
  stash_ids uuid[] not null check (cardinality(stash_ids) between 1 and 4 and array_position(stash_ids, null) is null),
  wish text not null default '' check (char_length(wish) <= 120),
  ideas jsonb not null check (jsonb_typeof(ideas) = 'array' and jsonb_array_length(ideas) between 1 and 5),
  weight text check (char_length(weight) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, stash_ids)
);

alter table public.knit_stash_ideas enable row level security;
create policy "mes idées pour ma laine" on public.knit_stash_ideas for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.knit_stash_ideas from anon, authenticated;
grant select, delete on public.knit_stash_ideas to authenticated;
grant insert (stash_ids, wish, ideas, weight) on public.knit_stash_ideas to authenticated;
grant update (wish, ideas, weight, updated_at) on public.knit_stash_ideas to authenticated;

create function public.knit_stash_forget_ideas() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.knit_stash_ideas where profile_id = old.profile_id and old.id = any (stash_ids);
  return old;
end;
$$;

create trigger knit_stash_forget_ideas after delete on public.knit_stash
  for each row execute function public.knit_stash_forget_ideas();
