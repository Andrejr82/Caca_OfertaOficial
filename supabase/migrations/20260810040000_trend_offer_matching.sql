-- Tendências IA Fase 1D: matching determinístico com ofertas reais Shopee/Mercado Livre.
-- Sem score comercial, recomendação, experimento ou publicação.

alter table public.trend_opportunities add column if not exists classification_id uuid references public.trend_signal_classifications(id) on delete restrict;
alter table public.trend_opportunities add column if not exists marketplace text check (marketplace is null or marketplace in ('Shopee', 'Mercado Livre'));
alter table public.trend_opportunities add column if not exists normalized_product_term text;
alter table public.trend_opportunities add column if not exists match_status text check (match_status is null or match_status in ('matched', 'no_match'));
alter table public.trend_opportunities add column if not exists match_reason text;
alter table public.trend_opportunities add column if not exists match_confidence numeric(5,2) check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 100));

create unique index if not exists trend_opportunities_user_signal_offer_strategy_idx
  on public.trend_opportunities(user_id, signal_id, offer_id, strategy_version);

create index if not exists trend_opportunities_classification_idx
  on public.trend_opportunities(user_id, classification_id);
