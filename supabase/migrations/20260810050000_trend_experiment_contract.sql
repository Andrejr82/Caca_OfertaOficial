-- Tendências IA 1F: contrato de experimento. Sem criação automática de registros.
alter table public.trend_experiments
  add column if not exists recommendation_id uuid references public.trend_recommendations(id) on delete restrict,
  add column if not exists offer_id uuid references public.offers(id) on delete restrict,
  add column if not exists marketplace text,
  add column if not exists channel text,
  add column if not exists format text,
  add column if not exists hypothesis text,
  add column if not exists started_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists metrics jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trend_experiments'::regclass
      and conname = 'trend_experiments_contract_values_check'
  ) then
    alter table public.trend_experiments
      add constraint trend_experiments_contract_values_check check (
        (marketplace is null or marketplace in ('Shopee', 'Mercado Livre'))
        and (channel is null or channel in ('WhatsApp', 'Telegram', 'Instagram', 'Facebook'))
        and (format is null or format in ('imagem', 'carrossel', 'vídeo'))
        and (ends_at is null or (started_at is not null and ends_at = started_at + interval '7 days'))
      );
  end if;
end $$;

create unique index if not exists trend_experiments_user_recommendation_idx
  on public.trend_experiments(user_id, recommendation_id)
  where recommendation_id is not null;

create index if not exists trend_experiments_user_status_ends_idx
  on public.trend_experiments(user_id, status, ends_at);
