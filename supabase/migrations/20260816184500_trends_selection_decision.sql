alter table public.trend_radar_products
  add column if not exists selection_decision text null,
  add column if not exists selection_decided_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trend_radar_products_selection_decision_check'
      and conrelid = 'public.trend_radar_products'::regclass
  ) then
    alter table public.trend_radar_products
      add constraint trend_radar_products_selection_decision_check
      check (selection_decision is null or selection_decision in ('IGNORAR', 'APROVAR_TESTE'));
  end if;
end $$;
