-- Fase 3.2 — proveniência auditável da atribuição de vendas.
-- Não reclassifica vendas históricas nem infere sub_id retroativamente.

alter table public.sales
  add column if not exists attribution_method text not null default 'unattributed',
  add column if not exists source_sub_id text,
  add column if not exists link_resolution text not null default 'missing';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sales'::regclass
      and conname = 'sales_attribution_method_check'
  ) then
    alter table public.sales
      add constraint sales_attribution_method_check
      check (attribution_method in ('sub_id', 'affiliate_link_id', 'channel_only', 'unattributed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sales'::regclass
      and conname = 'sales_link_resolution_check'
  ) then
    alter table public.sales
      add constraint sales_link_resolution_check
      check (link_resolution in ('matched', 'missing'));
  end if;
end $$;
