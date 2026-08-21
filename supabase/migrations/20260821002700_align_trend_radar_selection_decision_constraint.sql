alter table public.trend_radar_products
  drop constraint if exists trend_radar_products_selection_decision_check;

alter table public.trend_radar_products
  add constraint trend_radar_products_selection_decision_check
  check (
    selection_decision is null
    or selection_decision in (
      'IGNORAR',
      'APROVAR_TESTE',
      'TESTAR',
      'PRIORIDADE'
    )
  );
