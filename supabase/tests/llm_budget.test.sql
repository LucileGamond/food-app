begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

delete from public.llm_usage;
delete from public.llm_credits;
delete from public.llm_budget;
delete from public.llm_cost_cache;

-- Coût enregistré par le serveur ; les anciennes lignes ont été chiffrées par la migration (vérifié sur un équivalent)
set local role service_role;
insert into public.llm_usage (function, model, input_tokens, output_tokens, cost_usd, created_at) values
  ('knit-pattern', 'claude-haiku-5-5', 1000, 100, 2.00, now()),
  ('import-recipe', 'claude-haiku-5-5', 1000, 100, 1.50, now()),
  ('tidy-shopping', 'claude-haiku-5-5', 1000, 100, 4.00, date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' - interval '1 hour'),
  ('inconnu', 'gpt-9', 1000, 100, null, now());
select throws_ok($$insert into public.llm_usage (function, model, cost_usd) values ('f', 'm', -1)$$, '23514', null, 'coût négatif refusé');
reset role;

select is(
  round(public.llm_cost_of('claude-haiku-5-5-20261001', 1000000, 1000000, 1000000, 1000000, 2), 6),
  round(0.1 + 0.5 + 0.125 + 0.01 + 0.02, 6),
  'tarif de la migration (identifiant daté compris), identique à _shared/pricing.ts'
);
select is(public.llm_cost_of('gpt-9', 1, 1, 0, 0, 0), null, 'modèle sans tarif : coût inconnu');

-- Anonyme : aucun accès
set local role anon;
select throws_ok('select * from public.llm_budget', '42501', null, 'anon ne lit pas le budget');
select throws_ok('select * from public.llm_credits', '42501', null, 'anon ne lit pas les recharges');
select throws_ok('select * from public.llm_cost_cache', '42501', null, 'anon ne lit pas le coût réel');
select throws_ok('select * from public.llm_budget_status()', '42501', null, 'anon ne lit pas l''état du budget');
select throws_ok('select public.set_llm_budget(5)', '42501', null, 'anon ne règle pas le budget');
reset role;

-- Connectée : budget du foyer
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select row(monthly_eur, round(spent_usd, 2))::text from public.llm_budget_status()), row(null::numeric, 3.50::numeric)::text, 'sans budget : dépense du mois (heure de Paris) seulement');
select public.set_llm_budget(5);
select is((select monthly_eur from public.llm_budget_status()), 5.00::numeric, 'budget réglé');
select public.set_llm_budget(8.5);
select is((select count(*)::int from public.llm_budget), 1, 'un seul budget pour le foyer');
select is((select row(monthly_eur, updated_by)::text from public.llm_budget), row(8.50::numeric, '11111111-1111-1111-1111-111111111111'::uuid)::text, 'budget modifié, avec son auteur');
select throws_ok('select public.set_llm_budget(0)', '23514', null, 'budget nul refusé');
select public.set_llm_budget(null);
select is((select monthly_eur from public.llm_budget_status()), null, 'budget retiré');
select throws_ok($$insert into public.llm_budget (monthly_eur) values (1)$$, '42501', null, 'budget écrit seulement par set_llm_budget');

-- Recharges
insert into public.llm_credits (added_on, amount_usd, note) values ((now() at time zone 'Europe/Paris')::date - 3, 20, 'Recharge');
select is((select created_by from public.llm_credits), '11111111-1111-1111-1111-111111111111'::uuid, 'recharge au nom de la personne connectée');
select throws_ok($$insert into public.llm_credits (amount_usd) values (0)$$, '23514', null, 'recharge nulle refusée');
select throws_ok($$update public.llm_credits set amount_usd = 1$$, '42501', null, 'recharge non modifiable (on la supprime)');
select is(
  (select row(credits_usd, since, round(spent_usd, 2))::text from public.llm_credit_status()),
  row(20.00::numeric, (now() at time zone 'Europe/Paris')::date - 3, 3.50::numeric)::text,
  'crédit : recharges, date de la première, dépense depuis'
);
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.llm_credits), 1, 'le foyer voit les recharges de l''autre');
delete from public.llm_credits;
select is((select count(*)::int from public.llm_credits), 0, 'recharge supprimée');

-- Coût réel : écrit par le serveur seulement
select throws_ok($$insert into public.llm_cost_cache (since, cost_usd, fetched_at) values (current_date, 1, now())$$, '42501', null, 'le client n''écrit pas le coût réel');
reset role;
set local role service_role;
insert into public.llm_cost_cache (id, since, cost_usd, fetched_at) values (true, current_date, 1.5, now());
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select cost_usd from public.llm_cost_cache), 1.5::numeric, 'le foyer lit le coût réel');
reset role;

-- Le serveur lit l'état du budget (vérification avant chaque appel)
set local role service_role;
select is((select round(spent_usd, 2) from public.llm_budget_status()), 3.50::numeric, 'le serveur lit la dépense du mois');
reset role;

select * from finish();
rollback;
