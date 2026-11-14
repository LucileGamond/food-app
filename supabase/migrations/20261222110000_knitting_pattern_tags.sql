-- Bibliothèque de patrons : étiquettes libres (« pull », « bébé », « cadeau ») pour ranger et filtrer les patrons.
-- En minuscules, sans espace au bord ni doublon, 30 caractères chacune, 10 par patron.

create function public.knit_pattern_tags_are_valid(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_tags) <= 10
    and cardinality(p_tags) = (select count(distinct t) from unnest(p_tags) as u(t))
    and not exists (
      select 1 from unnest(p_tags) as u(tag)
      where tag is null or tag <> btrim(tag) or tag <> lower(tag) or char_length(tag) not between 1 and 30
    );
$$;

alter table public.knit_patterns
  add column tags text[] not null default '{}',
  add constraint knit_patterns_tags_valid check (public.knit_pattern_tags_are_valid(tags));

grant insert (tags), update (tags) on public.knit_patterns to authenticated;
