-- Trends Executive Radar Fase 2.1: snapshots auditáveis do Radar.
-- Somente schema. Não executa Radar, não publica e não cria snapshots.

create table if not exists public.trend_radar_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  radar_date date not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  strategy_version text not null,
  status text not null default 'building' check (status in ('building', 'completed', 'failed')),
  generated_at timestamptz not null default now(),
  source_health jsonb not null default '{}'::jsonb check (jsonb_typeof(source_health) = 'object'),
  executive_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(executive_summary) = 'object'),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end > window_start),
  unique (user_id, radar_date, window_start, window_end, strategy_version)
);

create table if not exists public.trend_radar_products (
  id uuid primary key default gen_random_uuid(),
  radar_run_id uuid not null references public.trend_radar_runs(id) on delete cascade,
  priority integer not null check (priority between 1 and 20),
  product_term text not null,
  normalized_product_term text not null,
  category text,
  marketplace text,
  marketplace_key text generated always as (coalesce(marketplace, '')) stored,
  evidence_status text not null check (evidence_status in ('verified', 'partial', 'unverified', 'rejected')),
  source_count integer not null default 0 check (source_count >= 0),
  commercial_score numeric(5,2) check (commercial_score is null or (commercial_score >= 0 and commercial_score <= 100)),
  confidence numeric(5,2) not null check (confidence >= 0 and confidence <= 100),
  direct_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(direct_evidence) = 'array'),
  inferred_signals jsonb not null default '[]'::jsonb check (jsonb_typeof(inferred_signals) = 'array'),
  affiliate_potential text not null default 'unassessed' check (affiliate_potential in ('high', 'medium', 'low', 'unassessed')),
  visual_content_potential text not null default 'unassessed' check (visual_content_potential in ('high', 'medium', 'low', 'unassessed')),
  recommended_channel text,
  recommended_format text,
  match_status text not null default 'pending' check (match_status in ('pending', 'matched', 'no_match')),
  opportunity_id uuid references public.trend_opportunities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (radar_run_id, priority),
  unique (radar_run_id, normalized_product_term, marketplace_key)
);

create index if not exists trend_radar_runs_user_date_idx
  on public.trend_radar_runs(user_id, radar_date desc, generated_at desc);

create index if not exists trend_radar_runs_user_status_idx
  on public.trend_radar_runs(user_id, status, generated_at desc);

create index if not exists trend_radar_products_run_priority_idx
  on public.trend_radar_products(radar_run_id, priority);

create index if not exists trend_radar_products_opportunity_idx
  on public.trend_radar_products(opportunity_id)
  where opportunity_id is not null;

alter table public.trend_radar_runs enable row level security;
alter table public.trend_radar_products enable row level security;

drop policy if exists "trend radar runs own" on public.trend_radar_runs;
create policy "trend radar runs own"
  on public.trend_radar_runs
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "trend radar products own" on public.trend_radar_products;
create policy "trend radar products own"
  on public.trend_radar_products
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.trend_radar_runs run
      where run.id = radar_run_id
        and run.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.trend_radar_runs run
      where run.id = radar_run_id
        and run.user_id = (select auth.uid())
    )
  );
