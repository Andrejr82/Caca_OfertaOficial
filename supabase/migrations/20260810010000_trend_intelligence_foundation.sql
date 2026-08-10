-- Tendências IA Fase 1A: contratos e persistência neutra.
-- Sem fontes externas, publicação ou execução de experimentos.

create table if not exists public.trend_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('internal', 'external', 'manual')),
  source_name text not null,
  external_id text,
  title text not null,
  evidence jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trend_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null references public.trend_signals(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete restrict,
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  status text not null default 'discovered' check (status in ('discovered', 'matched', 'recommended', 'approved', 'active', 'measuring', 'completed', 'scaled', 'adjusted', 'aborted')),
  experiment_id uuid,
  strategy_version text not null,
  final_decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trend_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.trend_opportunities(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete restrict,
  channel text,
  format text,
  justification text,
  hypothesis text,
  status text not null default 'recommended' check (status in ('discovered', 'matched', 'recommended', 'approved', 'active', 'measuring', 'completed', 'scaled', 'adjusted', 'aborted')),
  created_at timestamptz not null default now()
);

create table if not exists public.trend_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.trend_opportunities(id) on delete cascade,
  window_days integer not null default 7 check (window_days = 7),
  strategy_version text not null,
  status text not null default 'approved' check (status in ('discovered', 'matched', 'recommended', 'approved', 'active', 'measuring', 'completed', 'scaled', 'adjusted', 'aborted')),
  final_decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trend_signals_user_captured_idx on public.trend_signals(user_id, captured_at desc);
create index if not exists trend_opportunities_user_status_idx on public.trend_opportunities(user_id, status, created_at desc);
create index if not exists trend_opportunities_offer_idx on public.trend_opportunities(user_id, offer_id);
create index if not exists trend_recommendations_opportunity_idx on public.trend_recommendations(user_id, opportunity_id);
create index if not exists trend_experiments_opportunity_idx on public.trend_experiments(user_id, opportunity_id);

alter table public.trend_signals enable row level security;
alter table public.trend_opportunities enable row level security;
alter table public.trend_recommendations enable row level security;
alter table public.trend_experiments enable row level security;

drop policy if exists "trend signals own" on public.trend_signals;
drop policy if exists "trend opportunities own" on public.trend_opportunities;
drop policy if exists "trend recommendations own" on public.trend_recommendations;
drop policy if exists "trend experiments own" on public.trend_experiments;
create policy "trend signals own" on public.trend_signals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trend opportunities own" on public.trend_opportunities for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trend recommendations own" on public.trend_recommendations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trend experiments own" on public.trend_experiments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
