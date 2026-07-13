-- Sprint 4.1C - reconciliacao unica do banco V5
--
-- Esta migration absorve como baseline, sem replay de DDL ou DML:
--   - Mercado Livre V5;
--   - ai_copy_logs, audit, baileys, categories, curation_v2, tracking,
--     platform_netshoes e soft_delete_posts.
--
-- O registro no ledger deve ser somente o registro normal desta migration
-- pelo runner do Supabase. Nao modificar supabase_migrations.schema_migrations
-- manualmente e nao reaplicar as migrations historicas absorvidas.
--
-- Deliberadamente fora de escopo:
--   - Shopee V5 (somente validado e preservado);
--   - tabelas e views obs_* / vw_obs_*;
--   - policies RLS e ai_copy_logs;
--   - extensions;
--   - public.clean_old_integration_logs().

begin;

-- ============================================================================
-- 1. Baseline: validar objetos materializados sem recria-los
-- ============================================================================

do $baseline_validation$
declare
  missing_objects text[] := array[]::text[];
  offers_oid regclass := to_regclass('public.offers');
  posts_oid regclass := to_regclass('public.posts');
  profiles_oid regclass := to_regclass('public.profiles');
  integration_logs_oid regclass := to_regclass('public.integration_logs');
  required_relation text;
  offers_status_definition text;
  offers_platform_definition text;
  posts_status_definition text;
begin
  if offers_oid is null then
    missing_objects := array_append(missing_objects, 'public.offers');
  else
    -- Mercado Livre V5: baseline materializado, sem replay.
    if exists (
      select 1
      from unnest(array[
        'category_id',
        'category_name',
        'source_position',
        'item_id',
        'product_id',
        'seller_id',
        'seller_name',
        'shipping_free',
        'source_categories'
      ]) as required_column(column_name)
      where not exists (
        select 1
        from pg_attribute
        where attrelid = offers_oid
          and attname = required_column.column_name
          and attnum > 0
          and not attisdropped
      )
    ) then
      missing_objects := array_append(missing_objects, 'Mercado Livre V5 columns');
    end if;

    if to_regclass('public.offers_ml_item_id_idx') is null then
      missing_objects := array_append(missing_objects, 'public.offers_ml_item_id_idx');
    end if;

    if to_regclass('public.offers_ml_product_id_idx') is null then
      missing_objects := array_append(missing_objects, 'public.offers_ml_product_id_idx');
    end if;

    -- Shopee V5: preservar e validar, sem qualquer alteracao.
    if exists (
      select 1
      from unnest(array[
        'shopee_item_id',
        'shopee_shop_id',
        'shopee_product_cat_id',
        'native_category_order',
        'native_category_position',
        'marketplace_metrics'
      ]) as required_column(column_name)
      where not exists (
        select 1
        from pg_attribute
        where attrelid = offers_oid
          and attname = required_column.column_name
          and attnum > 0
          and not attisdropped
      )
    ) then
      missing_objects := array_append(missing_objects, 'Shopee V5 columns');
    end if;

    if to_regclass('public.offers_shopee_native_item_unique') is null then
      missing_objects := array_append(missing_objects, 'public.offers_shopee_native_item_unique');
    end if;

    select pg_get_constraintdef(oid, true)
      into offers_status_definition
      from pg_constraint
     where conrelid = offers_oid
       and conname = 'offers_status_check';

    if offers_status_definition is null
       or offers_status_definition not like '%draft%'
       or offers_status_definition not like '%pending_manual_review%'
       or offers_status_definition not like '%selected%'
       or offers_status_definition not like '%approved%'
       or offers_status_definition not like '%posted%'
       or offers_status_definition not like '%rejected%' then
      missing_objects := array_append(missing_objects, 'public.offers_status_check V5');
    end if;

    -- curation_v2 e categories.
    if exists (
      select 1
      from unnest(array['legacy_score', 'new_score', 'explainability', 'subcategory'])
        as required_column(column_name)
      where not exists (
        select 1
        from pg_attribute
        where attrelid = offers_oid
          and attname = required_column.column_name
          and attnum > 0
          and not attisdropped
      )
    ) then
      missing_objects := array_append(missing_objects, 'curation_v2/categories offers columns');
    end if;

    if to_regclass('public.offers_new_score_idx') is null then
      missing_objects := array_append(missing_objects, 'public.offers_new_score_idx');
    end if;

    select pg_get_constraintdef(oid, true)
      into offers_platform_definition
      from pg_constraint
     where conrelid = offers_oid
       and conname = 'offers_platform_check';

    if offers_platform_definition is null
       or offers_platform_definition not like '%Shein%'
       or offers_platform_definition not like '%Netshoes%'
       or offers_platform_definition not like '%Link Externo%' then
      missing_objects := array_append(missing_objects, 'public.offers_platform_check Netshoes');
    end if;
  end if;

  -- Demais migrations historicas absorvidas pelo baseline.
  if to_regclass('public.ai_copy_logs') is null then
    missing_objects := array_append(missing_objects, 'public.ai_copy_logs');
  end if;

  if to_regclass('public.audit_logs') is null then
    missing_objects := array_append(missing_objects, 'public.audit_logs');
  end if;

  if to_regclass('public.baileys_sessions') is null then
    missing_objects := array_append(missing_objects, 'public.baileys_sessions');
  end if;

  if to_regclass('public.categories') is null then
    missing_objects := array_append(missing_objects, 'public.categories');
  elsif (select count(*) from public.categories) < 216 then
    missing_objects := array_append(missing_objects, 'public.categories certified seed (at least 216 rows)');
  end if;

  if to_regclass('public.click_events') is null then
    missing_objects := array_append(missing_objects, 'public.click_events');
  end if;

  if to_regclass('public.daily_click_stats') is null then
    missing_objects := array_append(missing_objects, 'public.daily_click_stats');
  end if;

  foreach required_relation in array array[
    'public.categories_parent_idx',
    'public.categories_slug_idx',
    'public.categories_active_idx',
    'public.offers_category_idx',
    'public.offers_subcategory_idx',
    'public.click_events_link_id_idx',
    'public.click_events_created_at_idx',
    'public.daily_click_stats_link_date_idx',
    'public.posts_status_idx'
  ] loop
    if to_regclass(required_relation) is null then
      missing_objects := array_append(missing_objects, required_relation);
    end if;
  end loop;

  if profiles_oid is null then
    missing_objects := array_append(missing_objects, 'public.profiles');
  elsif exists (
    select 1
    from unnest(array['role', 'status']) as required_column(column_name)
    where not exists (
      select 1
      from pg_attribute
      where attrelid = profiles_oid
        and attname = required_column.column_name
        and attnum > 0
        and not attisdropped
    )
  ) then
    missing_objects := array_append(missing_objects, 'audit profile columns');
  end if;

  if posts_oid is null then
    missing_objects := array_append(missing_objects, 'public.posts');
  else
    if exists (
      select 1
      from unnest(array['deleted_at', 'deleted_by']) as required_column(column_name)
      where not exists (
        select 1
        from pg_attribute
        where attrelid = posts_oid
          and attname = required_column.column_name
          and attnum > 0
          and not attisdropped
      )
    ) then
      missing_objects := array_append(missing_objects, 'soft_delete_posts columns');
    end if;

    select pg_get_constraintdef(oid, true)
      into posts_status_definition
      from pg_constraint
     where conrelid = posts_oid
       and conname = 'posts_status_check';

    if posts_status_definition is null
       or posts_status_definition not like '%draft%'
       or posts_status_definition not like '%published%'
       or posts_status_definition not like '%failed%'
       or posts_status_definition not like '%deleted%' then
      missing_objects := array_append(missing_objects, 'public.posts_status_check');
    end if;
  end if;

  if integration_logs_oid is null then
    missing_objects := array_append(missing_objects, 'public.integration_logs');
  elsif exists (
    select 1
    from unnest(array['user_id', 'created_at']) as required_column(column_name)
    where not exists (
      select 1
      from pg_attribute
      where attrelid = integration_logs_oid
        and attname = required_column.column_name
        and attnum > 0
        and not attisdropped
    )
  ) then
    missing_objects := array_append(missing_objects, 'integration_logs required columns');
  end if;

  if cardinality(missing_objects) > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Baseline reconciliation aborted. Missing certified objects: %s',
        array_to_string(missing_objects, ', ')
      );
  end if;
end
$baseline_validation$;

-- ============================================================================
-- 2. Indices faltantes certificados
-- ============================================================================

create index if not exists offers_user_url_idx
  on public.offers (user_id, original_url);

create index if not exists integration_logs_created_at_idx
  on public.integration_logs (created_at);

-- ============================================================================
-- 3. Contrato canonico: integration_logs.user_id deve ser NOT NULL
-- ============================================================================

do $integration_logs_not_null_guard$
declare
  null_user_count bigint;
begin
  if to_regclass('public.integration_logs') is null then
    raise exception using
      errcode = 'P0001',
      message = 'Reconciliation aborted: public.integration_logs does not exist.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_logs'
      and column_name = 'user_id'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Reconciliation aborted: public.integration_logs.user_id does not exist.';
  end if;

  select count(*)
    into null_user_count
    from public.integration_logs
   where user_id is null;

  if null_user_count <> 0 then
    raise exception using
      errcode = '23502',
      message = format(
        'Reconciliation aborted: public.integration_logs.user_id contains %s NULL row(s); expected 0.',
        null_user_count
      );
  end if;
end
$integration_logs_not_null_guard$;

alter table public.integration_logs
  alter column user_id set not null;

commit;
