-- Trends Executive Radar Fase 2.4: metadados auditáveis do ranking.
-- Somente schema. Não executa Radar, não publica e não cria snapshots.

alter table public.trend_radar_products
  add column if not exists score_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists determining_reasons jsonb not null default '[]'::jsonb,
  add column if not exists is_focus boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.trend_radar_products'::regclass
      and conname = 'trend_radar_products_score_breakdown_object_check'
  ) then
    alter table public.trend_radar_products
      add constraint trend_radar_products_score_breakdown_object_check
      check (jsonb_typeof(score_breakdown) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.trend_radar_products'::regclass
      and conname = 'trend_radar_products_determining_reasons_array_check'
  ) then
    alter table public.trend_radar_products
      add constraint trend_radar_products_determining_reasons_array_check
      check (jsonb_typeof(determining_reasons) = 'array');
  end if;
end $$;
