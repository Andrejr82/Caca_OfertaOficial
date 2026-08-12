create table if not exists public.trend_offer_exposure_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  radar_run_id uuid not null references public.trend_radar_runs(id) on delete cascade,
  marketplace text not null check (marketplace in ('Shopee', 'Mercado Livre')),
  native_product_id text not null check (length(trim(native_product_id)) > 0),
  offer_id uuid null references public.offers(id) on delete set null,
  product_term text null,
  exposure_status text not null default 'exposed'
    check (exposure_status in ('exposed', 'pending', 'approved', 'rejected', 'published')),
  rejection_reason text null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  first_exposed_at timestamptz not null default now(),
  last_exposed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, radar_run_id, marketplace, native_product_id)
);

create index if not exists trend_offer_exposure_history_user_market_status_idx
  on public.trend_offer_exposure_history(user_id, marketplace, exposure_status, last_exposed_at desc);

create index if not exists trend_offer_exposure_history_user_native_idx
  on public.trend_offer_exposure_history(user_id, marketplace, native_product_id, last_exposed_at desc);

create index if not exists trend_offer_exposure_history_run_idx
  on public.trend_offer_exposure_history(radar_run_id, marketplace, last_exposed_at desc);

alter table public.trend_offer_exposure_history enable row level security;

drop policy if exists "trend offer exposure history own select" on public.trend_offer_exposure_history;
create policy "trend offer exposure history own select"
  on public.trend_offer_exposure_history
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "trend offer exposure history own insert" on public.trend_offer_exposure_history;
create policy "trend offer exposure history own insert"
  on public.trend_offer_exposure_history
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "trend offer exposure history own update" on public.trend_offer_exposure_history;
create policy "trend offer exposure history own update"
  on public.trend_offer_exposure_history
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.trend_offer_exposure_history from anon;
grant select, insert, update on table public.trend_offer_exposure_history to authenticated;
grant select, insert, update on table public.trend_offer_exposure_history to service_role;
