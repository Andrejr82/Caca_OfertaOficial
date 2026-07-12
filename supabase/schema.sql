create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('Shopee', 'Amazon', 'Magalu', 'Mercado Livre', 'Shein', 'Outro')),
  product_name text not null,
  category text,
  original_url text not null,
  image_url text,
  current_price numeric(12,2) not null check (current_price >= 0),
  old_price numeric(12,2) check (old_price is null or old_price >= 0),
  coupon text,
  rating numeric(3,2) check (rating is null or (rating >= 0 and rating <= 5)),
  estimated_commission numeric(12,2) check (estimated_commission is null or estimated_commission >= 0),
  commission_rate numeric(5,2) check (commission_rate is null or commission_rate >= 0),
  score numeric(4,2) not null default 0 check (score >= 0 and score <= 10),
  legacy_score numeric(4,2) check (legacy_score is null or (legacy_score >= 0 and legacy_score <= 10)),
  new_score numeric(4,2) check (new_score is null or (new_score >= 0 and new_score <= 10)),
  explainability jsonb default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'pending_manual_review', 'selected', 'posted', 'rejected')),
  shopee_item_id text,
  shopee_shop_id text,
  shopee_product_cat_id text,
  native_category_order integer,
  native_category_position integer,
  marketplace_metrics jsonb not null default '{}'::jsonb,
  notes text,
  seasonality numeric(4,2) check (seasonality is null or (seasonality >= 0 and seasonality <= 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists offers_shopee_native_item_unique
  on public.offers (user_id, platform, shopee_item_id)
  where platform = 'Shopee' and shopee_item_id is not null;

create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'instagram', 'whatsapp')),
  original_url text not null,
  tracked_url text not null,
  sub_id text not null,
  clicks integer not null default 0 check (clicks >= 0),
  created_at timestamptz not null default now(),
  unique (offer_id, channel)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  affiliate_link_id uuid references public.affiliate_links(id) on delete set null,
  channel text not null check (channel in ('telegram', 'instagram', 'whatsapp')),
  content text not null,
  external_id text,
  status text not null default 'draft' check (status in ('draft', 'published', 'failed', 'deleted')),
  posted_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  affiliate_link_id uuid references public.affiliate_links(id) on delete set null,
  channel text not null check (channel in ('telegram', 'instagram', 'whatsapp')),
  gross_value numeric(12,2) not null check (gross_value >= 0),
  commission_value numeric(12,2) not null check (commission_value >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration text not null,
  action text not null,
  status text not null check (status in ('success', 'error', 'skipped')),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists offers_user_status_idx on public.offers(user_id, status);
create index if not exists offers_user_platform_idx on public.offers(user_id, platform);
create index if not exists offers_user_score_idx on public.offers(user_id, score desc);
create index if not exists offers_new_score_idx on public.offers(new_score desc);
create index if not exists affiliate_links_user_offer_idx on public.affiliate_links(user_id, offer_id);
create index if not exists posts_user_channel_idx on public.posts(user_id, channel);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists sales_user_sold_at_idx on public.sales(user_id, sold_at desc);
create index if not exists integration_logs_user_created_idx on public.integration_logs(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.offers enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.posts enable row level security;
alter table public.sales enable row level security;
alter table public.integration_logs enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles select own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "profiles delete own" on public.profiles;
create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles delete own" on public.profiles for delete using (auth.uid() = id);

drop policy if exists "offers select own" on public.offers;
drop policy if exists "offers insert own" on public.offers;
drop policy if exists "offers update own" on public.offers;
drop policy if exists "offers delete own" on public.offers;
create policy "offers select own" on public.offers for select using (auth.uid() = user_id);
create policy "offers insert own" on public.offers for insert with check (auth.uid() = user_id);
create policy "offers update own" on public.offers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "offers delete own" on public.offers for delete using (auth.uid() = user_id);

drop policy if exists "affiliate_links select own" on public.affiliate_links;
drop policy if exists "affiliate_links insert own" on public.affiliate_links;
drop policy if exists "affiliate_links update own" on public.affiliate_links;
drop policy if exists "affiliate_links delete own" on public.affiliate_links;
create policy "affiliate_links select own" on public.affiliate_links for select using (auth.uid() = user_id);
create policy "affiliate_links insert own" on public.affiliate_links for insert with check (auth.uid() = user_id);
create policy "affiliate_links update own" on public.affiliate_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "affiliate_links delete own" on public.affiliate_links for delete using (auth.uid() = user_id);

drop policy if exists "posts select own" on public.posts;
drop policy if exists "posts insert own" on public.posts;
drop policy if exists "posts update own" on public.posts;
drop policy if exists "posts delete own" on public.posts;
create policy "posts select own" on public.posts for select using (auth.uid() = user_id);
create policy "posts insert own" on public.posts for insert with check (auth.uid() = user_id);
create policy "posts update own" on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "posts delete own" on public.posts for delete using (auth.uid() = user_id);

drop policy if exists "sales select own" on public.sales;
drop policy if exists "sales insert own" on public.sales;
drop policy if exists "sales update own" on public.sales;
drop policy if exists "sales delete own" on public.sales;
create policy "sales select own" on public.sales for select using (auth.uid() = user_id);
create policy "sales insert own" on public.sales for insert with check (auth.uid() = user_id);
create policy "sales update own" on public.sales for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sales delete own" on public.sales for delete using (auth.uid() = user_id);

drop policy if exists "integration_logs select own" on public.integration_logs;
drop policy if exists "integration_logs insert own" on public.integration_logs;
drop policy if exists "integration_logs update own" on public.integration_logs;
drop policy if exists "integration_logs delete own" on public.integration_logs;
create policy "integration_logs select own" on public.integration_logs for select using (auth.uid() = user_id);
create policy "integration_logs insert own" on public.integration_logs for insert with check (auth.uid() = user_id);
create policy "integration_logs update own" on public.integration_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "integration_logs delete own" on public.integration_logs for delete using (auth.uid() = user_id);

drop policy if exists "app_settings select own" on public.app_settings;
drop policy if exists "app_settings insert own" on public.app_settings;
drop policy if exists "app_settings update own" on public.app_settings;
drop policy if exists "app_settings delete own" on public.app_settings;
create policy "app_settings select own" on public.app_settings for select using (auth.uid() = user_id);
create policy "app_settings insert own" on public.app_settings for insert with check (auth.uid() = user_id);
create policy "app_settings update own" on public.app_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "app_settings delete own" on public.app_settings for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'offer-images',
  'offer-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'offer images select own'
  ) then
    create policy "offer images select own"
      on storage.objects for select
      using (bucket_id = 'offer-images' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'offer images insert own'
  ) then
    create policy "offer images insert own"
      on storage.objects for insert
      with check (bucket_id = 'offer-images' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'offer images update own'
  ) then
    create policy "offer images update own"
      on storage.objects for update
      using (bucket_id = 'offer-images' and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = 'offer-images' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'offer images delete own'
  ) then
    create policy "offer images delete own"
      on storage.objects for delete
      using (bucket_id = 'offer-images' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;

create table if not exists public.ai_copy_logs (
    id uuid default gen_random_uuid() primary key,
    offer_id uuid references public.offers(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    winner_strategy text,
    score numeric,
    model text,
    created_at timestamptz default now()
);

alter table public.ai_copy_logs enable row level security;
