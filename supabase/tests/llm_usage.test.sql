begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

delete from public.llm_usage;

-- Le serveur (clé de service) écrit la consommation
set local role service_role;
insert into public.llm_usage (user_id, function, mode, model, ok, requests, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, web_searches, created_at)
values
  ('11111111-1111-1111-1111-111111111111', 'knit-pattern', 'ideas', 'claude-haiku-5-5', true, 2, 1000, 200, 0, 50, 3, now()),
  ('11111111-1111-1111-1111-111111111111', 'knit-pattern', 'ideas', 'claude-haiku-5-5', false, 1, 500, 0, 0, 0, 0, now()),
  ('22222222-2222-2222-2222-222222222222', 'import-recipe', 'url', 'claude-haiku-5-5', true, 1, 300, 100, 0, 0, 0, now()),
  (null, 'tidy-shopping', null, 'claude-haiku-5-5', true, 1, 10, 5, 0, 0, 0, now() - interval '40 days');
select pass('le serveur écrit la consommation');
select throws_ok(
  $$insert into public.llm_usage (function, model, input_tokens, output_tokens) values ('f', 'm', -1, 0)$$,
  '23514', null, 'tokens négatifs refusés'
);
reset role;

-- Anonyme : aucun accès
set local role anon;
select throws_ok('select count(*) from public.llm_usage', '42501', null, 'anon ne lit pas la consommation');
select throws_ok('select * from public.llm_usage_summary(null)', '42501', null, 'anon ne lit pas les statistiques');
reset role;

-- Connectée : lit tout le foyer, n'écrit rien
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.llm_usage), 4, 'le foyer voit toute la consommation');
select throws_ok($$insert into public.llm_usage (function, model) values ('faux', 'm')$$, '42501', null, 'le client n''écrit pas de consommation');
select throws_ok($$update public.llm_usage set input_tokens = 0$$, '42501', null, 'le client ne modifie pas la consommation');
select throws_ok($$delete from public.llm_usage$$, '42501', null, 'le client ne supprime pas la consommation');

-- Statistiques : regroupées par personne, fonction, mode et modèle, depuis une date
select is(
  (select row(calls, requests, failures, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, web_searches)::text
     from public.llm_usage_summary(null) where function = 'knit-pattern'),
  row(2, 3, 1, 1500::bigint, 200::bigint, 0::bigint, 50::bigint, 3::bigint)::text,
  'appels, requêtes, échecs et tokens additionnés'
);
select is((select count(*)::int from public.llm_usage_summary(null)), 3, 'tout : une ligne par personne, fonction, mode et modèle');
select is((select count(*)::int from public.llm_usage_summary(now() - interval '30 days')), 2, 'depuis une date : l''ancien appel est exclu');
select is(
  (select count(*)::int from public.llm_usage_summary(now() - interval '60 days', now() - interval '30 days')),
  1, 'jusqu''à une date : période fermée (mois dernier)'
);
reset role;

-- Purge : au-delà de 12 mois
select is((select count(*)::int from cron.job where jobname = 'purge-llm-usage'), 1, 'purge planifiée');
insert into public.llm_usage (function, model, created_at) values ('vieux', 'm', now() - interval '13 months');
select public.purge_llm_usage();
select is((select count(*)::int from public.llm_usage where function = 'vieux'), 0, 'consommation de plus de 12 mois supprimée');

select * from finish();
rollback;
