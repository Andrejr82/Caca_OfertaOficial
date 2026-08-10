-- Google Trends Fase 1B: somente sinais reais, sem associação automática de oferta.

alter table public.trend_signals add column if not exists source text;
alter table public.trend_signals add column if not exists region text;
alter table public.trend_signals add column if not exists term text;
alter table public.trend_signals add column if not exists observed_at timestamptz;
alter table public.trend_signals add column if not exists trend_strength numeric(14,2);
alter table public.trend_signals add column if not exists trend_direction text;
alter table public.trend_signals add column if not exists offer_id uuid references public.offers(id) on delete set null;

create unique index if not exists trend_signals_user_source_external_idx
  on public.trend_signals(user_id, source_name, external_id)
  where external_id is not null;

create index if not exists trend_signals_user_observed_idx
  on public.trend_signals(user_id, observed_at desc);
