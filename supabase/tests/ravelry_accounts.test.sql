begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

delete from public.ravelry_oauth_states;
delete from public.ravelry_accounts;

-- Écrits par la fonction (clé de service)
insert into public.ravelry_accounts (profile_id, username) values ('11111111-1111-1111-1111-111111111111', 'lucile');
insert into public.ravelry_tokens (profile_id, access_token, refresh_token, expires_at)
  values ('11111111-1111-1111-1111-111111111111', 'acces', 'renouvellement', now() + interval '1 hour');
insert into public.ravelry_oauth_states (state, profile_id, code_verifier, redirect_uri)
  values (repeat('s', 43), '11111111-1111-1111-1111-111111111111', repeat('v', 43), 'http://localhost:5173/reglages/ravelry');
select throws_ok(
  $$insert into public.ravelry_oauth_states (state, profile_id, code_verifier, redirect_uri) values ('court', '11111111-1111-1111-1111-111111111111', repeat('v', 43), 'x')$$,
  '23514', null, 'état trop court refusé');

set local role anon;
select throws_ok('select count(*) from public.ravelry_accounts', '42501', null, 'anon ne voit pas les comptes');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select username from public.ravelry_accounts), 'lucile', 'son compte relié est visible');
select throws_ok('select count(*) from public.ravelry_tokens', '42501', null, 'jetons jamais lisibles par l''application');
select throws_ok('select count(*) from public.ravelry_oauth_states', '42501', null, 'connexions en cours jamais lisibles');
select throws_ok($$insert into public.ravelry_accounts (profile_id, username) values ('11111111-1111-1111-1111-111111111111', 'x')$$, '42501', null, 'compte relié seulement par la fonction');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.ravelry_accounts), 0, 'compte de chacun');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
delete from public.ravelry_accounts;
reset role;
select is((select count(*)::int from public.ravelry_tokens), 0, 'délier le compte supprime ses jetons');
select is((select count(*)::int from public.ravelry_oauth_states), 1, 'connexion en cours inchangée');

select * from finish();
rollback;
