-- Budget et crédit IA du foyer : coût de chaque appel (au tarif du jour, écrit par le serveur), budget mensuel vérifié
-- avant chaque appel au modèle, recharges de la clé Anthropic saisies à la main, et coût réel (API Admin) en cache.

-- Tarifs : identiques à supabase/functions/_shared/pricing.ts (dollars par million de tokens ; recherche : 0,01 $).
create function public.llm_cost_of(p_model text, p_input bigint, p_output bigint, p_cache_write bigint, p_cache_read bigint, p_web_searches bigint)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (p_input * p.input + p_output * p.output + p_cache_write * p.cache_write + p_cache_read * p.cache_read) / 1000000.0 + p_web_searches * 0.01
  from (values
    ('claude-haiku-5-5', 0.1, 0.5, 0.125, 0.01),
    ('claude-sonnet-5-5', 2, 10, 2.5, 0.2),
    ('claude-opus-5-5', 4, 20, 5, 0.2),
    ('claude-fable-5-1', 10, 50, 12.5, 0.25)
  ) as p(model, input, output, cache_write, cache_read)
  where p.model = regexp_replace(p_model, '-\d{8}$', '')
$$;

alter table public.llm_usage add column cost_usd numeric(14, 8) check (cost_usd >= 0);
update public.llm_usage
set cost_usd = public.llm_cost_of(model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, web_searches);

-- Début du mois en cours, heure de Paris.
create function public.llm_month_start(p_now timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', p_now at time zone 'Europe/Paris') at time zone 'Europe/Paris'
$$;

-- Budget mensuel du foyer (une seule ligne), réglé par set_llm_budget.
create table public.llm_budget (
  id boolean primary key default true check (id),
  monthly_eur numeric(10, 2) check (monthly_eur > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles on delete set null
);
alter table public.llm_budget enable row level security;
revoke all on public.llm_budget from anon, authenticated;
grant select on public.llm_budget to authenticated;
create policy "budget IA du foyer" on public.llm_budget for select to authenticated using (true);

create function public.set_llm_budget(p_monthly_eur numeric)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.llm_budget (id, monthly_eur, updated_at, updated_by)
  values (true, p_monthly_eur, now(), auth.uid())
  on conflict (id) do update set monthly_eur = excluded.monthly_eur, updated_at = excluded.updated_at, updated_by = excluded.updated_by
$$;
revoke execute on function public.set_llm_budget from public, anon;
grant execute on function public.set_llm_budget to authenticated;

-- Budget et dépense du mois en cours (lu par les Edge Functions avant chaque appel, et par Réglages).
create function public.llm_budget_status()
returns table (monthly_eur numeric, spent_usd numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select b.monthly_eur from public.llm_budget b),
    coalesce((select sum(u.cost_usd) from public.llm_usage u where u.created_at >= public.llm_month_start()), 0)
$$;
revoke execute on function public.llm_budget_status from public, anon;
grant execute on function public.llm_budget_status to authenticated, service_role;

-- Recharges de la clé Anthropic (en dollars, comme la Console).
create table public.llm_credits (
  id uuid primary key default gen_random_uuid(),
  added_on date not null default ((now() at time zone 'Europe/Paris')::date),
  amount_usd numeric(10, 2) not null check (amount_usd > 0 and amount_usd <= 10000),
  note text check (char_length(note) <= 200),
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
alter table public.llm_credits enable row level security;
revoke all on public.llm_credits from anon, authenticated;
grant select, delete on public.llm_credits to authenticated;
grant insert (added_on, amount_usd, note) on public.llm_credits to authenticated;
create policy "recharges IA du foyer" on public.llm_credits for all to authenticated using (true) with check (true);

-- Crédit : total des recharges, date de la première, dépense mesurée depuis (minuit, heure de Paris).
create function public.llm_credit_status()
returns table (credits_usd numeric, since date, spent_usd numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with c as (select sum(amount_usd) as total, min(added_on) as since from public.llm_credits)
  select
    coalesce(c.total, 0),
    c.since,
    coalesce((select sum(u.cost_usd) from public.llm_usage u where c.since is not null and u.created_at >= (c.since::timestamp at time zone 'Europe/Paris')), 0)
  from c
$$;
revoke execute on function public.llm_credit_status from public, anon;
grant execute on function public.llm_credit_status to authenticated;

-- Coût réel depuis la première recharge (rapport de coût Anthropic), gardé 48 h par l'Edge Function llm-cost.
create table public.llm_cost_cache (
  id boolean primary key default true check (id),
  since date not null,
  cost_usd numeric(14, 6) not null check (cost_usd >= 0),
  fetched_at timestamptz not null
);
alter table public.llm_cost_cache enable row level security;
revoke all on public.llm_cost_cache from anon, authenticated;
grant select on public.llm_cost_cache to authenticated;
create policy "coût réel lisible par le foyer" on public.llm_cost_cache for select to authenticated using (true);
