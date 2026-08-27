create table if not exists public.trend_radar_observations (
  id uuid primary key default gen_random_uuid(),
  radar_run_id uuid not null references public.trend_radar_runs(id) on delete cascade,
  user_id uuid not null,
  marketplace text not null,
  identity_key text not null,
  item_id text,
  product_id text,
  shop_id text,
  product_term text not null,
  normalized_product_term text not null,
  niche_id text,
  niche_label text,
  matched_product_term text,
  observed_at timestamptz not null,
  sales numeric,
  rank_position numeric,
  rank_authoritative boolean not null default false,
  best_seller_flag boolean not null default false,
  native_trend_scope text,
  native_trend_source text,
  native_trend_keyword text,
  trend_strategy_version text,
  observation_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (radar_run_id, identity_key)
);

create index if not exists trend_radar_observations_user_identity_time_idx
  on public.trend_radar_observations (user_id, identity_key, observed_at desc);
create index if not exists trend_radar_observations_user_market_time_idx
  on public.trend_radar_observations (user_id, marketplace, observed_at desc);
create index if not exists trend_radar_observations_run_idx
  on public.trend_radar_observations (radar_run_id);

alter table public.trend_radar_observations enable row level security;
drop policy if exists "trend radar observations own" on public.trend_radar_observations;
create policy "trend radar observations own"
  on public.trend_radar_observations for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into public.trend_radar_observations (
  radar_run_id,user_id,marketplace,identity_key,item_id,product_id,shop_id,
  product_term,normalized_product_term,niche_id,niche_label,matched_product_term,
  observed_at,sales,rank_position,rank_authoritative,best_seller_flag,
  native_trend_scope,native_trend_source,native_trend_keyword,trend_strategy_version,observation_payload
)
select
  p.radar_run_id,r.user_id,coalesce(p.marketplace,'unknown'),
  coalesce(p.marketplace,'unknown') || ':' || coalesce(nullif(ev->'marketplace_identity'->>'itemId',''), nullif(ev->'marketplace_identity'->>'productId','')),
  nullif(ev->'marketplace_identity'->>'itemId',''),nullif(ev->'marketplace_identity'->>'productId',''),nullif(ev->'marketplace_identity'->>'shopId',''),
  p.product_term,p.normalized_product_term,nullif(ev->>'niche_id',''),nullif(ev->>'niche_label',''),nullif(ev->>'matched_product_term',''),
  coalesce(nullif(ev->>'observed_at','')::timestamptz,p.created_at),
  nullif(ev->'temporal_metrics'->>'current_sales','')::numeric,
  case when coalesce(ev->>'trend_strategy_version','') in ('trend-radar-seven-niches-v2','trend-radar-seven-niches-v3')
       then nullif(ev->'temporal_metrics'->>'current_rank','')::numeric else null end,
  case when coalesce(ev->>'trend_strategy_version','') in ('trend-radar-seven-niches-v2','trend-radar-seven-niches-v3')
            and nullif(ev->'temporal_metrics'->>'current_rank','') is not null then true else false end,
  coalesce((ev->>'best_seller_flag')::boolean,false),nullif(ev->>'native_trend_scope',''),nullif(ev->>'native_trend_source',''),nullif(ev->>'native_trend_keyword',''),nullif(ev->>'trend_strategy_version',''),
  jsonb_build_object('backfilled_from','trend_radar_products','evidence_status',p.evidence_status,'trend_score',p.trend_score)
from public.trend_radar_products p
join public.trend_radar_runs r on r.id=p.radar_run_id
cross join lateral (select case when jsonb_typeof(p.direct_evidence)='array' then p.direct_evidence->0 else '{}'::jsonb end ev) x
where coalesce(nullif(ev->'marketplace_identity'->>'itemId',''), nullif(ev->'marketplace_identity'->>'productId','')) is not null
on conflict (radar_run_id, identity_key) do nothing;
