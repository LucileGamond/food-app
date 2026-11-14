-- Tricot : couleurs d'une laine (identité « Teinturerie »). Une laine peut porter « hues » : 1 à 3 couleurs
-- (« #rrggbb » en minuscules) vues sur la photo de l'étiquette ou choisies à la main. La première colore le projet
-- (boutons, jauge pelote et fil) ; les autres teintent les brins du fil (chiné, dégradé).
create or replace function public.knit_yarns_are_valid(p_yarns jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_yarns) = 'array'
    and jsonb_array_length(p_yarns) <= 6
    and not exists (
      select 1
      from jsonb_array_elements(p_yarns) y
      where jsonb_typeof(y) <> 'object'
        or exists (
          select 1 from jsonb_each(y) f
          where f.key not in ('brand', 'name', 'color', 'dye_lot', 'composition', 'weight_g', 'length_m', 'skeins', 'needle_mm', 'hues')
        )
        or exists (
          select 1 from jsonb_each(y) f
          where f.key in ('brand', 'name', 'color', 'dye_lot', 'composition')
            and jsonb_typeof(f.value) <> 'null'
            and (jsonb_typeof(f.value) <> 'string' or char_length(f.value #>> '{}') > 80)
        )
        or exists (
          select 1 from jsonb_each(y) f
          where f.key in ('weight_g', 'length_m', 'skeins', 'needle_mm')
            and jsonb_typeof(f.value) <> 'null'
            and (
              jsonb_typeof(f.value) <> 'number'
              or (f.key = 'weight_g' and (f.value::numeric not between 1 and 1000 or f.value::numeric % 1 <> 0))
              or (f.key = 'length_m' and (f.value::numeric not between 1 and 5000 or f.value::numeric % 1 <> 0))
              or (f.key = 'skeins' and (f.value::numeric not between 0 and 200 or f.value::numeric % 0.5 <> 0))
              or (f.key = 'needle_mm' and f.value::numeric not between 1 and 30)
            )
        )
        or (
          y ? 'hues'
          and (
            jsonb_typeof(y -> 'hues') <> 'array'
            or jsonb_array_length(y -> 'hues') > 3
            or exists (
              select 1 from jsonb_array_elements(y -> 'hues') h
              where jsonb_typeof(h) <> 'string' or (h #>> '{}') !~ '^#[0-9a-f]{6}$'
            )
          )
        )
    );
$$;
