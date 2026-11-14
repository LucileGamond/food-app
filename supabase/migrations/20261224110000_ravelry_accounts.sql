-- Compte Ravelry relié (OAuth 2.1), pour chercher de vrais patrons avec l'API de Ravelry (« Des idées pour ma laine »).
--
--   ravelry_accounts      compte relié (nom) : visible par la personne, qui peut le délier (suppression)
--   ravelry_tokens        jetons d'accès et de renouvellement : serveur seulement (fonction knit-pattern)
--   ravelry_oauth_states  connexion en cours (état et vérificateur PKCE, 10 minutes) : serveur seulement
--
-- Délier le compte (suppression de ravelry_accounts) supprime ses jetons.

create table public.ravelry_accounts (
  profile_id uuid primary key references public.profiles on delete cascade,
  username text not null check (char_length(username) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ravelry_accounts enable row level security;
create policy "mon compte Ravelry" on public.ravelry_accounts for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.ravelry_accounts from anon, authenticated;
grant select, delete on public.ravelry_accounts to authenticated;

create table public.ravelry_tokens (
  profile_id uuid primary key references public.ravelry_accounts on delete cascade,
  access_token text not null check (char_length(access_token) <= 4000),
  refresh_token text check (char_length(refresh_token) <= 4000),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.ravelry_tokens enable row level security;
revoke all on public.ravelry_tokens from anon, authenticated;

create table public.ravelry_oauth_states (
  state text primary key check (char_length(state) between 20 and 200),
  profile_id uuid not null references public.profiles on delete cascade,
  code_verifier text not null check (char_length(code_verifier) between 43 and 128),
  redirect_uri text not null check (char_length(redirect_uri) <= 500),
  created_at timestamptz not null default now()
);
create index ravelry_oauth_states_profile_idx on public.ravelry_oauth_states (profile_id);
alter table public.ravelry_oauth_states enable row level security;
revoke all on public.ravelry_oauth_states from anon, authenticated;
