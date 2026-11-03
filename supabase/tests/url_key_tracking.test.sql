begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

delete from public.planning_inbox;
delete from public.meals;
delete from public.recipes;

select is(
  public.recipe_url_key('https://www.marmiton.org/recettes/x.aspx?utm_source=android&utm_medium=app'),
  public.recipe_url_key('https://marmiton.org/recettes/x.aspx/'),
  'paramètres utm ignorés'
);
select is(public.recipe_url_key('https://www.youtube.com/shorts/abc?si=XYZ'), 'youtube.com/shorts/abc', 'partage YouTube (si) ignoré');
select is(public.recipe_url_key('https://site.fr/r?id=12&utm_campaign=a&page=2#top'), 'site.fr/r?id=12&page=2', 'autres paramètres gardés');
select is(public.recipe_url_key('https://www.instagram.com/reel/DfI/?igsh=abc'), 'instagram.com/reel/dfi', 'partage Instagram (igsh) ignoré');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.recipes (is_saved, title, url) values (true, 'Gratin', 'https://www.marmiton.org/recettes/gratin.aspx');
select is(
  (select title from public.find_saved_recipe_by_url('https://marmiton.org/recettes/gratin.aspx?utm_source=android')),
  'Gratin', 'recette déjà enregistrée reconnue malgré le suivi'
);
select public.add_to_inbox('Curry', 'https://site.fr/curry', null, 'plan', null);
select throws_ok(
  $$select public.add_to_inbox('Curry', 'https://site.fr/curry?fbclid=123', null, 'plan', null)$$,
  null, 'même lien déjà dans « À planifier »'
);

select * from finish();
rollback;
