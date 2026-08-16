alter table public.trend_radar_products
  add column if not exists selected_offer_id uuid null references public.offers(id) on delete set null,
  add column if not exists execution_context jsonb not null default '{}'::jsonb;

create index if not exists trend_radar_products_selected_offer_idx
  on public.trend_radar_products(selected_offer_id)
  where selected_offer_id is not null;
