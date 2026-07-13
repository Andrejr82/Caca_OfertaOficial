alter table public.offers drop constraint if exists offers_status_check;
alter table public.offers add constraint offers_status_check check (status in ('draft', 'pending_manual_review', 'selected', 'approved', 'posted', 'rejected'));

alter table public.offers add column if not exists category_id text;
alter table public.offers add column if not exists category_name text;
alter table public.offers add column if not exists source_position integer;
alter table public.offers add column if not exists item_id text;
alter table public.offers add column if not exists product_id text;
alter table public.offers add column if not exists seller_id text;
alter table public.offers add column if not exists seller_name text;
alter table public.offers add column if not exists shipping_free boolean;
alter table public.offers add column if not exists source_categories jsonb not null default '[]'::jsonb;

create index if not exists offers_ml_item_id_idx on public.offers(user_id, platform, item_id);
create index if not exists offers_ml_product_id_idx on public.offers(user_id, platform, product_id);
