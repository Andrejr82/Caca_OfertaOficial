alter table public.offers
  add column if not exists shopee_item_id text,
  add column if not exists shopee_shop_id text,
  add column if not exists shopee_product_cat_id text,
  add column if not exists native_category_order integer,
  add column if not exists native_category_position integer,
  add column if not exists marketplace_metrics jsonb not null default '{}'::jsonb;

do $$
declare
  current_definition text;
begin
  select pg_get_constraintdef(oid)
    into current_definition
    from pg_constraint
   where conrelid = 'public.offers'::regclass
     and conname = 'offers_status_check';

  if current_definition is null or current_definition not like '%pending_manual_review%' then
    alter table public.offers drop constraint if exists offers_status_check;
    alter table public.offers
      add constraint offers_status_check
      check (status in ('draft', 'approved', 'pending_manual_review', 'selected', 'rejected', 'posted'));
  end if;
end
$$;

create unique index if not exists offers_shopee_native_item_unique
  on public.offers (user_id, platform, shopee_item_id)
  where platform = 'Shopee' and shopee_item_id is not null;
