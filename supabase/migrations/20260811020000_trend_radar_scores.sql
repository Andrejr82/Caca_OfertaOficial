alter table public.trend_radar_products
  add column if not exists trend_score numeric(5,2)
  check (trend_score is null or (trend_score >= 0 and trend_score <= 100));

create index if not exists trend_radar_products_run_trend_score_idx
  on public.trend_radar_products(radar_run_id, trend_score desc nulls last);
