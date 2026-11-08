-- Consommation du modèle (Claude) : une ligne par appel d'une Edge Function, écrite par le serveur (clé de service).
-- Le foyer la lit (statistiques dans Réglages) ; le client n'y écrit jamais. Détail gardé 12 mois.

create table public.llm_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles on delete set null,
  function text not null,
  mode text,
  model text not null,
  ok boolean not null default true,
  requests integer not null default 1 check (requests >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_creation_tokens integer not null default 0 check (cache_creation_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  web_searches integer not null default 0 check (web_searches >= 0)
);

create index llm_usage_created_at on public.llm_usage (created_at);

alter table public.llm_usage enable row level security;
revoke all on public.llm_usage from anon, authenticated;
grant select on public.llm_usage to authenticated;
create policy "consommation lisible par le foyer" on public.llm_usage for select to authenticated using (true);

-- Totaux par personne, fonction, mode et modèle sur une période [p_since, p_until[ (bornes facultatives).
create function public.llm_usage_summary(p_since timestamptz default null, p_until timestamptz default null)
returns table (
  user_id uuid,
  function text,
  mode text,
  model text,
  calls integer,
  requests integer,
  failures integer,
  input_tokens bigint,
  output_tokens bigint,
  cache_creation_tokens bigint,
  cache_read_tokens bigint,
  web_searches bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.user_id, u.function, u.mode, u.model,
    count(*)::integer,
    sum(u.requests)::integer,
    (count(*) filter (where not u.ok))::integer,
    sum(u.input_tokens)::bigint,
    sum(u.output_tokens)::bigint,
    sum(u.cache_creation_tokens)::bigint,
    sum(u.cache_read_tokens)::bigint,
    sum(u.web_searches)::bigint
  from public.llm_usage u
  where (p_since is null or u.created_at >= p_since)
    and (p_until is null or u.created_at < p_until)
  group by u.user_id, u.function, u.mode, u.model
$$;
revoke execute on function public.llm_usage_summary from public, anon;
grant execute on function public.llm_usage_summary to authenticated;

create function public.purge_llm_usage()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.llm_usage where created_at < now() - interval '12 months'
$$;
revoke execute on function public.purge_llm_usage from public, anon, authenticated;

select cron.schedule('purge-llm-usage', '30 3 * * *', $cron$ select public.purge_llm_usage() $cron$);
