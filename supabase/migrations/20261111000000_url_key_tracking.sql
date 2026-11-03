-- Clé de comparaison des liens : aussi sans paramètres de suivi (utm_*, fbclid, igsh, si…), pour reconnaître une
-- recette déjà enregistrée quand le lien partagé porte « ?utm_source=… ».
-- Sert aux index uniques des recettes sauvegardées et de « À planifier » : reconstruits à la fin.

create or replace function public.recipe_url_key(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(btrim(p_url), '#.*$', ''),
    '([?&])(utm_[^=&]*|fbclid|gclid|dclid|msclkid|igsh|igshid|si|mc_cid|mc_eid|ref_src|_ga|_gl)=[^&]*', '\1', 'gi'),
    '&{2,}', '&', 'g'),
    '\?&', '?'),
    '[?&]+$', ''),
    '/+$', ''),
    '^https?://(www\.)?', '', 'i')), '')
$$;

-- Liens devenus identiques avec la nouvelle clé (ne différaient que par le suivi) :
--   « À planifier » : on garde l'élément le plus ancien ;
--   recettes sauvegardées : les plus récentes gardent leur lien, marqué pour rester distinct (rien n'est perdu).
delete from public.planning_inbox i
using public.planning_inbox o
where i.url is not null and o.url is not null
  and public.recipe_url_key(i.url) = public.recipe_url_key(o.url)
  and (o.created_at, o.id) < (i.created_at, i.id);

update public.recipes r
set url = r.url || case when r.url like '%?%' then '&' else '?' end || 'doublon=' || left(r.id::text, 8)
from public.recipes o
where r.is_saved and o.is_saved and r.url is not null and o.url is not null
  and public.recipe_url_key(r.url) = public.recipe_url_key(o.url)
  and (o.created_at, o.id) < (r.created_at, r.id);

reindex index public.recipes_saved_url_unique;
reindex index public.planning_inbox_url_unique;
